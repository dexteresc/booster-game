import { Peer } from 'peerjs'

// Peer-to-peer over WebRTC. The public PeerJS server only brokers the handshake;
// game traffic goes browser to browser. The host runs the only real sim.
// Raw data channel, every byte counts when it goes through the paid TURN relay:
//   joiner → host  1 byte of input (1 left engine, 2 right engine), on change and every second as a heartbeat
//   host → joiner  binary snapshots (src/snapshot.js), JSON text for the rest:
//                  { type: 'roster' | 'lobby' | 'full' | 'version', ... }
const ID_PREFIX = 'booster-game-'
// Bump when the messages change: host and joiner must run the same version.
const PROTOCOL = 2
const INPUT_HEARTBEAT_MS = 1000
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
        // msg: ArrayBuffer (snapshot) or an object, sent as JSON text.
        broadcast: (msg) => {
          const data = msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)
          for (const conn of players.keys()) conn.send(data)
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
    // Older joiners use PeerJS's JSON channel and don't send a protocol; they just see the host leave.
    if (conn.serialization !== 'raw' || conn.metadata?.protocol !== PROTOCOL) refuse(conn, 'version')
    else if (!handlers.onJoin(conn.peer, cleanName(conn.metadata?.name))) refuse(conn, 'full')
    else players.set(conn, Date.now())
  })
  conn.on('data', (msg) => {
    if (!players.has(conn) || !(msg instanceof ArrayBuffer) || msg.byteLength !== 1) return // not a player, or not input
    players.set(conn, Date.now())
    const bits = new Uint8Array(msg)[0]
    handlers.onInput(conn.peer, { left: (bits & 1) !== 0, right: (bits & 2) !== 0 })
  })
  conn.on('close', () => dropPlayer(players, conn, handlers))
  conn.on('error', handlers.onError)
}

function refuse(conn, type) {
  if (conn.serialization === 'raw') conn.send(JSON.stringify({ type }))
  setTimeout(() => conn.close(), 500)
}

function dropPlayer(players, conn, handlers) {
  if (!players.delete(conn)) return
  conn.close()
  handlers.onLeave(conn.peer)
}

// Joining gives up after this. When two browsers can't find a route to each other
// (strict NAT, mobile data, relay down), WebRTC can stay "checking" without ever failing.
const JOIN_TIMEOUT_MS = 15000

// handlers: { onSnapshot(ArrayBuffer), onRoster(roster), onLobby(lobby), onClose(reason) }. onClose fires at most once, only after joining.
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
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'raw', metadata: { name, protocol: PROTOCOL } })
      conn.on('error', onError) // failing before open emits 'error' but never 'close'
      conn.on('open', () => {
        clearTimeout(timer)
        link = watchHost(peer, conn, handlers)
        resolve({
          id,
          sendInput: inputSender(conn),
          leave: (reason) => link.close(reason),
        })
      })
    })
  })
}

// Sends only changes, plus a heartbeat so the host knows we're still here.
function inputSender(conn) {
  let sent = -1
  let sentAt = 0
  return ({ left, right }) => {
    const bits = (left ? 1 : 0) | (right ? 2 : 0)
    const now = performance.now()
    if (!conn.open || (bits === sent && now - sentAt < INPUT_HEARTBEAT_MS)) return
    conn.send(new Uint8Array([bits]).buffer)
    sent = bits
    sentAt = now
  }
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
  conn.on('data', (data) => {
    lastSeen = Date.now()
    const msg = data instanceof ArrayBuffer ? null : parseJson(data)
    if (data instanceof ArrayBuffer) handlers.onSnapshot(data)
    else if (msg?.type === 'roster') handlers.onRoster(msg)
    else if (msg?.type === 'lobby') handlers.onLobby(msg)
    else if (msg?.type === 'full') close('Room is full')
    else close('Host runs another version of the game. Reload both pages')
  })
  conn.on('close', () => close('Host left'))
  return { close }
}

// Text from the host that isn't JSON comes from a host on another version.
function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch (err) {
    console.error('Unreadable message from host', text, err)
    return null
  }
}
