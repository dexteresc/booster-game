import { Peer } from 'peerjs'

// Peer-to-peer over WebRTC. The public PeerJS server only brokers the handshake;
// game traffic goes browser to browser. The host runs the only real sim:
// clients send { type: 'input', left, right }, host sends { type: 'snapshot', ... }.
const ID_PREFIX = 'booster-game-'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Closing a tab doesn't always fire 'close' on the other side, so silence = gone.
const TIMEOUT_MS = 5000

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

// handlers: { onJoin(id) → accepted?, onLeave(id), onInput(id, input), onError(err) }
export function hostRoom(handlers) {
  return new Promise((resolve, reject) => {
    const code = randomCode()
    const peer = new Peer(ID_PREFIX + code)
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
    if (!handlers.onJoin(conn.peer)) {
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

// handlers: { onSnapshot(snapshot), onClose(reason) }. onClose fires at most once.
export function joinRoom(code, handlers) {
  return new Promise((resolve, reject) => {
    const peer = new Peer()
    let opened = false
    let closed = false
    let lastSeen = Date.now()
    let watchdog

    const close = (reason) => {
      if (closed) return
      closed = true
      clearInterval(watchdog)
      peer.destroy()
      handlers.onClose(reason)
    }

    peer.on('error', (err) => (opened ? close(`Connection error: ${err.message}`) : reject(err)))
    peer.on('open', (id) => {
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'json' })
      conn.on('open', () => {
        opened = true
        watchdog = setInterval(() => {
          if (Date.now() - lastSeen > TIMEOUT_MS) close('Lost connection to host')
        }, 1000)
        resolve({
          id,
          sendInput: ({ left, right }) => conn.open && conn.send({ type: 'input', left, right }),
        })
      })
      conn.on('data', (msg) => {
        lastSeen = Date.now()
        if (msg?.type === 'full') close('Room is full')
        else if (msg?.type === 'snapshot') handlers.onSnapshot(msg)
      })
      conn.on('close', () => close('Host left'))
    })
  })
}
