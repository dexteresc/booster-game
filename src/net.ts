import { Peer } from 'peerjs'
import type { DataConnection, PeerOptions } from 'peerjs'
import type { Input } from './sim/rocket.ts'
import type { Mode, Team } from './maps/parse.ts'
import type { Skin } from './art/skins.ts'
import { cleanSkin } from './art/skins.ts'

// Who a player is to the others: what they typed and picked in the menu, cleaned by the host.
export type Pilot = { name: string; skin: Skin }
// JSON the host sends joiners, next to binary snapshots (src/snapshot.ts).
export type RoomPlayer = Pilot & { id: string; team: Team }
export type RosterMessage = { type: 'roster'; mapName: string; mode: Mode; players: RoomPlayer[] }
export type LobbyMessage = { type: 'lobby'; mapName: string; players: RoomPlayer[] }
type HostMessage = RosterMessage | LobbyMessage | { type: 'full' } | { type: 'version' }

export type HostHandlers = {
  onJoin(id: string, pilot: Pilot): boolean // false refuses: the room is full
  onLeave(id: string): void
  onInput(id: string, input: Input): void
  onError(err: Error): void
}

type JoinHandlers = {
  onSnapshot(buffer: ArrayBuffer): void
  onRoster(roster: RosterMessage): void
  onLobby(lobby: LobbyMessage): void
  onClose(reason: string): void // fires at most once, only after joining
}

export type Room = { code: string; broadcast(msg: ArrayBuffer | HostMessage): void }
export type RoomClient = { id: string; sendInput(input: Input): void; leave(reason: string): void }

// conn → last message time
type Players = Map<DataConnection, number>

// Peer-to-peer over WebRTC. The public PeerJS server only brokers the handshake;
// game traffic goes browser to browser. The host runs the only real sim.
// Raw data channel, every byte counts when it goes through the paid TURN relay:
//   joiner → host  { name, skin, protocol } as connection metadata, then
//                  1 byte of input (1 left engine, 2 right engine), on change and every second as a heartbeat
//   host → joiner  binary snapshots (src/snapshot.ts), JSON text for the rest:
//                  { type: 'roster' | 'lobby' | 'full' | 'version', ... }
const ID_PREFIX = 'booster-game-'
// Bump when the messages change: host and joiner must run the same version.
const PROTOCOL = 3
const INPUT_HEARTBEAT_MS = 1000
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Closing a tab doesn't always fire 'close' on the other side, so silence = gone.
const TIMEOUT_MS = 5000
// Our Worker (worker/turn.ts) that hands out short-lived TURN relay credentials, see TURN.md.
// Empty = PeerJS's free public relay, often overloaded.
const TURN_CREDENTIALS_URL = 'https://booster-turn.nqvst.workers.dev/'
const CREDENTIALS_TIMEOUT_MS = 5000

// Peer options with fresh TURN credentials. Players who can't connect directly
// (strict NAT, mobile data, office wifi) go through the relay.
async function peerOptions(): Promise<Partial<PeerOptions>> {
  if (!TURN_CREDENTIALS_URL) {
    console.warn("TURN_CREDENTIALS_URL not set in src/net.ts: using PeerJS's public relay. See worker/wrangler.toml")
    return {}
  }
  try {
    const res = await fetch(TURN_CREDENTIALS_URL, { signal: AbortSignal.timeout(CREDENTIALS_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const body = await res.json()
    if (!Array.isArray(body.iceServers)) throw new Error(`expected { iceServers: [...] }, got keys ${Object.keys(body)}`)
    return { config: { iceServers: body.iceServers } }
  } catch (err) {
    throw new Error(`couldn't get relay credentials from ${TURN_CREDENTIALS_URL}: ${errorMessage(err)}`, { cause: err })
  }
}

// What a catch clause caught, for showing. Anything can be thrown, so it may not be an Error.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const NAME_LENGTH = 16

// Player names come from other browsers: plain text, one line, short.
function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH) : ''
  return name || 'Pilot'
}

// Skins are unlocked in the joiner's browser; the host can only check they exist, not that they were earned.
export function cleanPilot(raw: { name?: unknown; skin?: unknown } | undefined): Pilot {
  return { name: cleanName(raw?.name), skin: cleanSkin(raw?.skin) }
}

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

export async function hostRoom(handlers: HostHandlers): Promise<Room> {
  const options = await peerOptions()
  return new Promise((resolve, reject) => {
    const code = randomCode()
    const peer = new Peer(ID_PREFIX + code, options)
    const players: Players = new Map()
    let opened = false

    peer.on('open', () => {
      opened = true
      setInterval(() => {
        for (const [conn, seen] of players) {
          if (Date.now() - seen > TIMEOUT_MS) dropPlayer(players, conn, handlers)
        }
      }, 1000)
      resolve({
        code,
        // msg: ArrayBuffer (snapshot) or an object, sent as JSON text.
        broadcast: (msg) => {
          const data = msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)
          for (const conn of players.keys()) send(conn, data)
        },
      })
    })
    peer.on('error', (err) => (opened ? handlers.onError(err) : reject(err)))

    peer.on('connection', (conn) => acceptPlayer(players, conn, handlers))
  })
}

function acceptPlayer(players: Players, conn: DataConnection, handlers: HostHandlers): void {
  conn.on('open', () => {
    // Older joiners use PeerJS's JSON channel and don't send a protocol; they just see the host leave.
    if (conn.serialization !== 'raw' || conn.metadata?.protocol !== PROTOCOL) refuse(conn, 'version')
    else if (!handlers.onJoin(conn.peer, cleanPilot(conn.metadata))) refuse(conn, 'full')
    else players.set(conn, Date.now())
  })
  conn.on('data', (msg) => {
    // Not a player, or not input.
    if (!players.has(conn) || !(msg instanceof ArrayBuffer) || msg.byteLength !== 1) return
    players.set(conn, Date.now())
    const bits = new Uint8Array(msg)[0]
    handlers.onInput(conn.peer, { left: (bits & 1) !== 0, right: (bits & 2) !== 0 })
  })
  conn.on('close', () => dropPlayer(players, conn, handlers))
  conn.on('error', handlers.onError)
}

// send can return a promise; a failed one says so instead of going unnoticed.
function send(conn: DataConnection, data: ArrayBuffer | string): void {
  Promise.resolve(conn.send(data)).catch((err: unknown) => console.error('Sending to', conn.peer, 'failed', err))
}

function refuse(conn: DataConnection, type: 'full' | 'version'): void {
  if (conn.serialization === 'raw') send(conn, JSON.stringify({ type }))
  setTimeout(() => conn.close(), 500)
}

function dropPlayer(players: Players, conn: DataConnection, handlers: HostHandlers): void {
  if (!players.delete(conn)) return
  conn.close()
  handlers.onLeave(conn.peer)
}

// Joining gives up after this. When two browsers can't find a route to each other
// (strict NAT, mobile data, relay down), WebRTC can stay "checking" without ever failing.
const JOIN_TIMEOUT_MS = 15000

export async function joinRoom(code: string, pilot: Pilot, handlers: JoinHandlers): Promise<RoomClient> {
  const options = await peerOptions()
  return new Promise((resolve, reject) => {
    const peer = new Peer(options)
    let link: { close(reason: string): void } | null = null // set once connected
    const fail = (err: Error) => {
      clearTimeout(timer)
      peer.destroy()
      reject(err)
    }
    const timer = setTimeout(
      () => fail(new Error(`no answer from host after ${JOIN_TIMEOUT_MS / 1000}s. A firewall or mobile network may be blocking it`)),
      JOIN_TIMEOUT_MS,
    )
    const onError = (err: Error) => (link ? link.close(`Connection error: ${err.message}`) : fail(err))

    peer.on('error', onError)
    peer.on('open', (id) => {
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'raw', metadata: { ...pilot, protocol: PROTOCOL } })
      conn.on('error', onError) // failing before open emits 'error' but never 'close'
      conn.on('open', () => {
        clearTimeout(timer)
        const hostLink = watchHost(peer, conn, handlers)
        link = hostLink
        resolve({
          id,
          sendInput: inputSender(conn),
          leave: (reason) => hostLink.close(reason),
        })
      })
    })
  })
}

// Sends only changes, plus a heartbeat so the host knows we're still here.
function inputSender(conn: DataConnection): (input: Input) => void {
  let sent = -1
  let sentAt = 0
  return ({ left, right }) => {
    const bits = (left ? 1 : 0) | (right ? 2 : 0)
    const now = performance.now()
    if (!conn.open || (bits === sent && now - sentAt < INPUT_HEARTBEAT_MS)) return
    send(conn, new Uint8Array([bits]).buffer)
    sent = bits
    sentAt = now
  }
}

// Connected: route the host's messages; silence means the host is gone.
function watchHost(peer: Peer, conn: DataConnection, handlers: JoinHandlers): { close(reason: string): void } {
  let closed = false
  let lastSeen = Date.now()
  const close = (reason: string) => {
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
    else if (msg?.type === 'roster') handlers.onRoster(msg as RosterMessage)
    else if (msg?.type === 'lobby') handlers.onLobby(msg as LobbyMessage)
    else if (msg?.type === 'full') close('Room is full')
    else close('Host runs another version of the game. Reload both pages')
  })
  conn.on('close', () => close('Host left'))
  return { close }
}

// Text from the host that isn't JSON comes from a host on another version.
function parseJson(text: unknown): { type?: string } | null {
  try {
    return JSON.parse(String(text))
  } catch (err) {
    console.error('Unreadable message from host', text, err)
    return null
  }
}
