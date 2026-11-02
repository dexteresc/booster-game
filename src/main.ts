import type { Game, GameEvent } from './sim/game.ts'
import type { Input } from './sim/rocket.ts'
import type { Mode } from './maps/parse.ts'
import type { HostHandlers, LobbyMessage, Pilot, Room, RoomClient, RoomPlayer, RosterMessage } from './net.ts'
import { config } from './config.ts'
import { byId, find } from './dom.ts'
import { flashLabel, relabel } from './button-label.ts'
import { anotherMap, mapFor, maps } from './maps/index.ts'
import { addPlayer, createGame, maxPlayersPerTeam, removePlayer, step } from './sim/game.ts'
import { createLocalInput } from './input.ts'
import { createRenderer } from './render.ts'
import { createSettingsDialog, loadSettings } from './settings.ts'
import { cleanPilot, errorMessage, hostRoom, joinRoom } from './net.ts'
import { loadPilot, showMenu } from './menu.ts'
import { storedProgress } from './progress.ts'
import { unlockMessage } from './art/skins.ts'
import { renderLobby, switchTeam, teamFor } from './lobby.ts'
import { encodeSnapshot } from './snapshot.ts'
import { createRemoteGame } from './remote-game.ts'

const LOCAL_ID = 'host'
const RESTART_DELAY_SECONDS = 4
const SNAPSHOT_EVERY_TICKS = 6 // ticks → 20 Hz at 120 tick rate. Joiners smooth between them (remote-game.ts)
const LOBBY_EVERY_SECONDS = 1 // between lobby broadcasts; they also tell joiners the host is still there

const canvas = find<HTMLCanvasElement>(document, 'canvas')
const ui = {
  status: byId('status'),
  invite: byId<HTMLButtonElement>('invite'),
  map: byId<HTMLSelectElement>('map'),
  leave: byId<HTMLButtonElement>('leave'),
  menu: byId('menu'),
  lobby: byId('lobby'),
}
const input = createLocalInput(canvas, config.keys)
const settings = loadSettings()
const draw = createRenderer(canvas, config, settings)
createSettingsDialog(config, settings)
const progress = storedProgress() // skin unlocks, counted from what this screen shows

let mode: Mode | null = null // picked in the menu
let mapName: string | null = null
let game: Game | null = null // the sim this browser runs. null in the menu, the lobby and while joined
let players: RoomPlayer[] = [] // host: everyone in the room. PvE: all blue
let localId = LOCAL_ID
let room: Room | null = null // set while hosting
let client: RoomClient | null = null // set while joined
// Set while joined: the host's game as this browser shows it.
let remote: ReturnType<typeof createRemoteGame> | null = null
let rosterKey: string | null = null // host: what joiners were last told about who's in the match
const remoteInputs: Record<string, Input> = {}
let pending = 0
let ticksSinceSnapshot = 0
let sinceLobby = 0
let unsentEvents: GameEvent[] = []
let drawEvents: GameEvent[] = [] // sim/snapshot events not yet shown

// Visible: sim steps right before each draw, so every frame advances by the
// same number of ticks (no judder). Hidden: background tabs throttle rAF,
// which would freeze a host's game for everyone, so a worker timer takes over.
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000 / 60)'])))
ticker.onmessage = () => document.hidden && advance()

let lastTick = performance.now()
function advance() {
  const now = performance.now()
  const elapsed = Math.min((now - lastTick) / 1000, 0.25)
  lastTick = now
  const local = { left: input.left, right: input.right }
  if (client) client.sendInput(local)
  else if (game) runSim(game, elapsed, local)
  else if (room) keepLobbyAlive(room, elapsed)
}

let lastFrame = performance.now()
requestAnimationFrame(function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.25)
  lastFrame = now
  advance()
  if (remote) drawEvents.push(...remote.show(now / 1000))
  const shown = remote ? remote.game : game
  for (const goal of shown ? progress.observe(shown, localId, elapsed) : []) showStatus(unlockMessage(goal))
  if (shown) draw(shown, localId, drawEvents, elapsed)
  drawEvents = []
  requestAnimationFrame(frame)
})

// Local or hosting: fixed-step sim, each tick gets everyone's latest input.
function runSim(sim: Game, elapsed: number, local: Input) {
  pending += elapsed
  const tick = 1 / config.tickRate
  while (pending >= tick) {
    step(sim, { ...remoteInputs, [localId]: local }, config)
    drawEvents.push(...sim.events)
    pending -= tick
    if (!room) continue
    unsentEvents.push(...sim.events)
    if (++ticksSinceSnapshot < SNAPSHOT_EVERY_TICKS) continue
    sendRoster(room, sim)
    room.broadcast(encodeSnapshot(sim, unsentEvents))
    ticksSinceSnapshot = 0
    unsentEvents = []
  }
  if (sim.winner && sim.wonAt !== null && sim.time - sim.wonAt > RESTART_DELAY_SECONDS) {
    if (mode && mapName) selectMap(anotherMap(mode, mapName)) // joiners follow: the roster and lobby carry the name
    if (mode === 'pvp') openLobby()
    else newGame()
  }
}

// From the menu, or straight in from a ?map= link (the editor's Play).
async function start(pickedMode: Mode, pilot: Pilot) {
  ui.menu.hidden = true
  mode = pickedMode
  players = [{ id: LOCAL_ID, ...cleanPilot(pilot), team: 'blue' }]
  selectMap(mapFor(mode))
  if (mode === 'pve') newGame()
  else if (await openRoom()) openLobby()
  else backToMenu() // openRoom said why
}

function newGame() {
  if (!mapName || !mode) throw new Error('Starting a game before a mode and map are picked')
  game = createGame(maps[mapName], players, mode)
  rosterKey = null // joiners who came in during the lobby haven't heard it yet
  refreshControls()
}

// Snapshots list rockets by roster order, so joiners hear who's who (and the map) first, and again on any change.
function sendRoster(activeRoom: Room, sim: Game) {
  if (!mapName) throw new Error('Match running without a map')
  const roster: RosterMessage = { type: 'roster', mapName, mode: sim.mode, players: sim.rockets.map(({ id, name, team, skin }) => ({ id, name, team, skin })) }
  const key = JSON.stringify(roster)
  if (key === rosterKey) return
  activeRoom.broadcast(roster)
  rosterKey = key
}

function selectMap(name: string) {
  mapName = name
  history.replaceState(null, '', `${location.pathname}?map=${encodeURIComponent(name)}${location.hash}`)
  const names = Object.keys(maps).filter((n) => maps[n].mode === mode)
  ui.map.replaceChildren(...names.map((n) => new Option(n, n, false, n === name)))
}

ui.map.onchange = () => {
  selectMap(ui.map.value)
  if (game) newGame()
  else refreshLobby()
}

// Second click confirms: a stray tap shouldn't end the game (hosting: for everyone). Not a confirm()
// dialog, that would freeze the host's sim for all players while it's open.
ui.leave.onclick = () => {
  const asking = ui.leave.dataset.label !== undefined
  if (asking) location.href = location.pathname
  else flashLabel(ui.leave, 'Sure? Click again', false)
}

// Host only: what's in the top bar. Joiners just get Leave.
function refreshControls() {
  ui.invite.hidden = Boolean(client) || !mode
  ui.map.hidden = Boolean(client) || !mode || (mode === 'pvp' && Boolean(game))
  ui.leave.hidden = !mode && !client
}

// PvP host: pick teams, then start. Joiners see the same list without the buttons.
function openLobby() {
  game = null
  refreshControls()
  refreshLobby()
}

const lobbyActions = {
  onSwitch: (id: string) => switchTeam(players, id) && refreshLobby(),
  onStart: () => {
    ui.lobby.hidden = true
    newGame()
  },
  onInvite: copyInvite,
}

function refreshLobby() {
  if (game || mode !== 'pvp' || !room || !mapName) return
  broadcastLobby(room, mapName)
  renderLobby(ui.lobby, { players, mapName }, { localId, code: room.code, actions: lobbyActions })
}

function broadcastLobby(activeRoom: Room, lobbyMap: string) {
  activeRoom.broadcast({ type: 'lobby', players, mapName: lobbyMap })
  sinceLobby = 0
}

function keepLobbyAlive(activeRoom: Room, elapsed: number) {
  sinceLobby += elapsed
  if (sinceLobby >= LOBBY_EVERY_SECONDS && mapName) broadcastLobby(activeRoom, mapName)
}

const hostHandlers: HostHandlers = {
  onJoin(id, pilot) {
    const team = teamForJoiner()
    if (!team) return false
    const player = { id, ...pilot, team }
    players.push(player)
    if (game) addPlayer(game, player)
    refreshLobby()
    return true
  },
  onLeave(id) {
    players = players.filter((p) => p.id !== id)
    if (game) removePlayer(game, id)
    delete remoteInputs[id]
    refreshLobby()
  },
  onInput(id, playerInput) {
    remoteInputs[id] = playerInput
  },
  onError(err) {
    console.error('Host network error', err)
    showStatus(`Network error: ${err.message}`)
  },
}

// PvE: everyone is blue, as many as the pad fits. PvP: the smaller team, mid-match too.
function teamForJoiner() {
  if (mode === 'pvp') return teamFor(players)
  return game && players.length < maxPlayersPerTeam(game, 'blue') ? 'blue' : null
}

// Returns the room, or null if there can't be one (and says why).
async function openRoom(): Promise<Room | null> {
  if (room) return room
  try {
    room = await hostRoom(hostHandlers)
    ui.status.hidden = true // an earlier failure no longer applies
    return room
  } catch (err) {
    console.error('Creating room failed', err)
    showStatus(`Couldn't create room: ${errorMessage(err)}`)
    return null
  }
}

// The top bar's Invite or the lobby's Copy invite link: feedback shows on the button that was clicked.
async function copyInvite(event: Event) {
  const button = event.currentTarget as HTMLButtonElement // only ever bound to buttons
  if (!room) relabel(button, 'Opening room…', { busy: true })
  const opened = await openRoom()
  if (!opened) {
    flashLabel(button, "Couldn't open room", false)
    return
  }
  const link = `${location.origin}${location.pathname}#${opened.code}`
  try {
    await navigator.clipboard.writeText(link)
    flashLabel(button, 'Link copied ✓', true)
  } catch (err) {
    console.error('Clipboard write failed', err)
    flashLabel(button, "Couldn't copy", false)
    showStatus(`Share this link: ${link}`)
  }
}

ui.invite.onclick = copyInvite

async function join(code: string, pilot: Pilot) {
  ui.menu.hidden = true
  showStatus(`Joining ${code}…`)
  const joined = createRemoteGame()
  const onLobby = (lobby: LobbyMessage) => showJoinedLobby(lobby, code)
  const onSnapshot = (buffer: ArrayBuffer) => joined.snapshot(buffer, performance.now() / 1000)
  remote = joined
  try {
    client = await joinRoom(code, cleanPilot(pilot), { onSnapshot, onRoster, onLobby, onClose: backToMenu })
  } catch (err) {
    console.error(`Joining ${code} failed`, err)
    backToMenu(`Couldn't join ${code}: ${errorMessage(err)}`)
    return
  }
  localId = client.id
  refreshControls()
  showStatus(`Joined room ${code}`)
}

// A match started, or players changed. The roster carries the host's map and mode, so a joiner follows map changes.
function onRoster(roster: RosterMessage) {
  if (!maps[roster.mapName]) {
    client?.leave(`Host is playing map "${roster.mapName}", which this version doesn't have. Reload to update`)
    return
  }
  ui.lobby.hidden = true
  remote?.roster(maps[roster.mapName], roster)
}

function showJoinedLobby(lobby: LobbyMessage, code: string) {
  if (!Array.isArray(lobby.players)) throw new Error(`Lobby from host has no player list: ${JSON.stringify(lobby)}`)
  remote?.end()
  renderLobby(ui.lobby, lobby, { localId, code, actions: null })
}

// reason: shown in the status line; left out keeps what's there.
function backToMenu(reason?: string) {
  client = null
  remote = null
  game = null
  mode = null
  localId = LOCAL_ID
  history.replaceState(null, '', location.pathname) // reload shouldn't rejoin
  ui.lobby.hidden = true
  refreshControls()
  openMenu('')
  if (reason) showStatus(reason)
}

function openMenu(code: string) {
  const handlers = {
    onPick: (pickedMode: Mode, pilot: Pilot) => run(start(pickedMode, pilot), 'Starting the game'),
    onJoin: (pilot: Pilot) => run(join(code, pilot), `Joining ${code}`),
  }
  showMenu(ui.menu, { joinCode: code, rules: config.rules, stats: progress.stats, handlers })
}

// For async work nobody awaits: a failure still reaches the console and the player.
function run(work: Promise<void>, what: string) {
  work.catch((err: unknown) => {
    console.error(`${what} failed`, err)
    showStatus(`${what} failed: ${errorMessage(err)}`)
  })
}

function showStatus(text: string) {
  ui.status.textContent = text
  ui.status.hidden = false
}

// #CODE: invite link. ?map=<name>: play that map now, in its mode.
const joinCode = location.hash.slice(1).toUpperCase()
const linkedMap = new URLSearchParams(location.search).get('map')
refreshControls()
if (joinCode) openMenu(joinCode)
else if (linkedMap && maps[linkedMap]) run(start(maps[linkedMap].mode, loadPilot()), 'Starting the game')
else openMenu('')
if (linkedMap && !maps[linkedMap]) showStatus(`No map "${linkedMap}". Maps: ${Object.keys(maps).join(', ')}`)
