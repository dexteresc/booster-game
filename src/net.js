import { Peer } from 'peerjs'

// Peer-to-peer over WebRTC. The public PeerJS server only brokers the handshake;
// game traffic goes browser to browser. The host runs the only real sim:
// clients connect with their name and send { type: 'input', left, right };
// host sends { type: 'snapshot', ... } in game and { type: 'lobby', ... } while picking teams.
const ID_PREFIX = 'booster-game-'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Closing a tab doesn't always fire 'close' on the other side, so silence = gone.
const TIMEOUT_MS = 5000
// Our Worker (worker/turn.js) that hands out short-lived TURN relay credentials, see TURN.md.
// Empty = PeerJS's free public relay, often overloaded.
const TURN_CREDENTIALS_URL = 'https://booster-turn.nqvst.workers.dev/'
const CREDENTIALS_TIMEOUT_MS = 5000

// Peer options with fresh TURN credentials. Players who can't connect directly
// (strict NAT, mobile data, office wifi) go through the relay.
async function peerOptions() {
  if (!TURN_CREDENTIALS_URL) {
    console.warn("TURN_CREDENTIALS_URL not set in src/net.js: using PeerJS's public relay. See worker/wrangler.toml")
    return {}
  }
  try {
    const res = await fetch(TURN_CREDENTIALS_URL, { signal: AbortSignal.timeout(CREDENTIALS_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const body = await res.json()
    if (!Array.isArray(body.iceServers)) throw new Error(`expected { iceServers: [...] }, got keys ${Object.keys(body)}`)
    return { config: { iceServers: body.iceServers } }
  } catch (err) {
    throw new Error(`couldn't get relay credentials from ${TURN_CREDENTIALS_URL}: ${err.message}`, { cause: err })
  }
}

const NAME_LENGTH = 16

// Player names come from other browsers: plain text, one line, short.
export function cleanName(raw) {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH) : ''
  return name || 'Pilot'
}

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

// handlers: { onJoin(id, name) → accepted?, onLeave(id), onInput(id, input), onError(err) }
export async function hostRoom(handlers) {
  const options = await peerOptions()
  return new Promise((resolve, reject) => {
    const code = randomCode()
    const peer = new Peer(ID_PREFIX + code, options)
    const players = new Map() // conn → last message time
    let opened = false

    peer.on('open', () => {
      opened = true
      setInterval(() => {
        for (const [conn, seen] of players) if (Date.now() - seen > TIMEOUT_MS) dropPlayer(players, conn, handlers)
      }, 1000)
      resolve({
        code,
        broadcast: (msg) => {
          for (const conn of players.keys()) conn.send(msg)
        },
      })
    })
    peer.on('error', (err) => (opened ? handlers.onError(err) : reject(err)))

    peer.on('connection', (conn) => acceptPlayer(players, conn, handlers))
  })
}

// players: conn → last message time
function acceptPlayer(players, conn, handlers) {
  conn.on('open', () => {
    if (!handlers.onJoin(conn.peer, cleanName(conn.metadata?.name))) {
      conn.send({ type: 'full' })
      setTimeout(() => conn.close(), 500)
      return
    }
    players.set(conn, Date.now())
  })
  conn.on('data', (msg) => {
    if (!players.has(conn) || msg?.type !== 'input') return
    players.set(conn, Date.now())
    handlers.onInput(conn.peer, { left: msg.left === true, right: msg.right === true })
  })
  conn.on('close', () => dropPlayer(players, conn, handlers))
  conn.on('error', handlers.onError)
}

function dropPlayer(players, conn, handlers) {
  if (!players.delete(conn)) return
  conn.close()
  handlers.onLeave(conn.peer)
}

// Joining gives up after this. When two browsers can't find a route to each other
// (strict NAT, mobile data, relay down), WebRTC can stay "checking" without ever failing.
const JOIN_TIMEOUT_MS = 15000

// handlers: { onSnapshot(snapshot), onLobby(lobby), onClose(reason) }. onClose fires at most once, only after joining.
export async function joinRoom(code, name, handlers) {
  const options = await peerOptions()
  return new Promise((resolve, reject) => {
    const peer = new Peer(options)
    let link = null // set once connected: { close(reason) }
    const fail = (err) => {
      clearTimeout(timer)
      peer.destroy()
      reject(err)
    }
    const timer = setTimeout(
      () => fail(new Error(`no answer from host after ${JOIN_TIMEOUT_MS / 1000}s. A firewall or mobile network may be blocking it`)),
      JOIN_TIMEOUT_MS,
    )
    const onError = (err) => (link ? link.close(`Connection error: ${err.message}`) : fail(err))

    peer.on('error', onError)
    peer.on('open', (id) => {
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'json', metadata: { name } })
      conn.on('error', onError) // failing before open emits 'error' but never 'close'
      conn.on('open', () => {
        clearTimeout(timer)
        link = watchHost(peer, conn, handlers)
        resolve({
          id,
          sendInput: ({ left, right }) => conn.open && conn.send({ type: 'input', left, right }),
          leave: (reason) => link.close(reason),
        })
      })
    })
  })
}

// Connected: route the host's messages; silence means the host is gone.
function watchHost(peer, conn, handlers) {
  let closed = false
  let lastSeen = Date.now()
  const close = (reason) => {
    if (closed) return
    closed = true
    clearInterval(watchdog)
    peer.destroy()
    handlers.onClose(reason)
  }
  const watchdog = setInterval(() => {
    if (Date.now() - lastSeen > TIMEOUT_MS) close('Lost connection to host')
  }, 1000)
  conn.on('data', (msg) => {
    lastSeen = Date.now()
    if (msg?.type === 'full') close('Room is full')
    else if (msg?.type === 'snapshot') handlers.onSnapshot(msg)
    else if (msg?.type === 'lobby') handlers.onLobby(msg)
  })
  conn.on('close', () => close('Host left'))
  return { close }
}
