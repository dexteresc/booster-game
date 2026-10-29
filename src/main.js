import { config } from './config.js'
import { DEFAULT_MAP, maps } from './maps/index.js'
import { addPlayer, createGame, maxPlayersPerTeam, removePlayer, snapshotOf, step } from './sim/game.js'
import { createLocalInput } from './input.js'
import { createRenderer } from './render.js'
import { createTuningPanel } from './tuning.js'
import { cleanName, hostRoom, joinRoom } from './net.js'
import { loadName, showMenu } from './menu.js'
import { renderLobby, switchTeam, teamFor } from './lobby.js'

const LOCAL_ID = 'host'
const RESTART_DELAY = 4
const SNAPSHOT_EVERY = 4 // ticks → 30 Hz at 120 tick rate
const LOBBY_EVERY = 1 // seconds between lobby broadcasts; they also tell joiners the host is still there

const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas')
const ui = { status: $('status'), invite: $('invite'), map: $('map'), leave: $('leave'), menu: $('menu'), lobby: $('lobby') }
const input = createLocalInput(canvas, config.keys)
const draw = createRenderer(canvas, config)
createTuningPanel(config)

let mode = null // 'pve' | 'pvp', picked in the menu
let mapName = null
let game = null // null in the menu and the lobby
let players = [] // host: everyone in the room, [{ id, name, team }]. PvE: all blue
let localId = LOCAL_ID
let room = null // set while hosting: { code, broadcast }
let client = null // set while joined: { id, sendInput, leave }
const remoteInputs = {}
let pending = 0
let ticksSinceSnapshot = 0
let sinceLobby = 0
let unsentEvents = []
let drawEvents = [] // sim/snapshot events not yet shown

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
  else if (game) runSim(elapsed, local)
  else if (room) keepLobbyAlive(elapsed)
}

let lastFrame = performance.now()
requestAnimationFrame(function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.25)
  lastFrame = now
  advance()
  if (game) draw(game, localId, drawEvents, elapsed)
  drawEvents = []
  requestAnimationFrame(frame)
})

// Local or hosting: fixed-step sim, each tick gets everyone's latest input.
function runSim(elapsed, local) {
  pending += elapsed
  const tick = 1 / config.tickRate
  while (pending >= tick) {
    step(game, { ...remoteInputs, [localId]: local }, config)
    drawEvents.push(...game.events)
    pending -= tick
    if (!room) continue
    unsentEvents.push(...game.events)
    if (++ticksSinceSnapshot < SNAPSHOT_EVERY) continue
    room.broadcast({ type: 'snapshot', mapName, mode, ...snapshotOf(game), events: unsentEvents })
    ticksSinceSnapshot = 0
    unsentEvents = []
  }
  if (game.winner && game.time - game.wonAt > RESTART_DELAY) {
    if (mode === 'pvp') openLobby()
    else newGame()
  }
}

// From the menu, or straight in from a ?map= link (the editor's Play).
async function start(pickedMode, name) {
  ui.menu.hidden = true
  mode = pickedMode
  players = [{ id: LOCAL_ID, name: cleanName(name), team: 'blue' }]
  selectMap(mapFor(mode))
  if (mode === 'pve') newGame()
  else if (await openRoom()) openLobby()
  else backToMenu() // openRoom said why
}

function newGame() {
  game = createGame(maps[mapName], players, mode)
  refreshControls()
}

// The map in the URL if it's made for this mode, else the first one that is.
function mapFor(wanted) {
  const linked = new URLSearchParams(location.search).get('map')
  if (maps[linked]?.mode === wanted) return linked
  if (maps[DEFAULT_MAP].mode === wanted) return DEFAULT_MAP
  const name = Object.keys(maps).find((n) => maps[n].mode === wanted)
  if (!name) throw new Error(`No ${wanted} map in src/maps/. Make one in the editor (mode: ${wanted})`)
  return name
}

function selectMap(name) {
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

ui.leave.onclick = () => (location.href = location.pathname)

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
  onSwitch: (id) => switchTeam(players, id) && refreshLobby(),
  onStart: () => {
    ui.lobby.hidden = true
    newGame()
  },
  onInvite: copyInvite,
}

function refreshLobby() {
  if (game || mode !== 'pvp') return
  broadcastLobby()
  renderLobby(ui.lobby, { players, mapName }, { localId, code: room.code, actions: lobbyActions })
}

function broadcastLobby() {
  room.broadcast({ type: 'lobby', players, mapName })
  sinceLobby = 0
}

function keepLobbyAlive(elapsed) {
  sinceLobby += elapsed
  if (sinceLobby >= LOBBY_EVERY) broadcastLobby()
}

const hostHandlers = {
  onJoin(id, name) {
    const team = teamForJoiner()
    if (!team) return false
    const player = { id, name, team }
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
  return players.length < maxPlayersPerTeam(game, 'blue') ? 'blue' : null
}

// Returns whether there's a room.
async function openRoom() {
  if (room) return true
  ui.invite.disabled = true
  try {
    room = await hostRoom(hostHandlers)
    ui.status.hidden = true // an earlier failure no longer applies
    return true
  } catch (err) {
    console.error('Creating room failed', err)
    showStatus(`Couldn't create room: ${err.message}`)
    return false
  } finally {
    ui.invite.disabled = false
  }
}

async function copyInvite() {
  if (!(await openRoom())) return
  const link = `${location.origin}${location.pathname}#${room.code}`
  try {
    await navigator.clipboard.writeText(link)
    showStatus(`Room ${room.code} · link copied: ${link}`)
  } catch (err) {
    console.error('Clipboard write failed', err)
    showStatus(`Room ${room.code} · share this link: ${link}`)
  }
}

ui.invite.onclick = copyInvite

async function join(code, name) {
  ui.menu.hidden = true
  showStatus(`Joining ${code}…`)
  const onLobby = (lobby) => showJoinedLobby(lobby, code)
  try {
    client = await joinRoom(code, cleanName(name), { onSnapshot, onLobby, onClose: backToMenu })
  } catch (err) {
    console.error(`Joining ${code} failed`, err)
    backToMenu(`Couldn't join ${code}: ${err.message}`)
    return
  }
  localId = client.id
  refreshControls()
  showStatus(`Joined room ${code}`)
}

// The host's map and mode come with every snapshot, so a joiner follows map changes.
function onSnapshot(snapshot) {
  if (game?.mapName !== snapshot.mapName) {
    if (!maps[snapshot.mapName]) {
      client.leave(`Host is playing map "${snapshot.mapName}", which this version doesn't have. Reload to update`)
      return
    }
    game = createGame(maps[snapshot.mapName], [], snapshot.mode)
  }
  ui.lobby.hidden = true
  Object.assign(game, snapshot)
  drawEvents.push(...snapshot.events)
}

function showJoinedLobby(lobby, code) {
  if (!Array.isArray(lobby.players)) throw new Error(`Lobby from host has no player list: ${JSON.stringify(lobby)}`)
  game = null
  renderLobby(ui.lobby, lobby, { localId, code, actions: null })
}

// reason: shown in the status line; left out keeps what's there.
function backToMenu(reason) {
  client = null
  game = null
  mode = null
  localId = LOCAL_ID
  history.replaceState(null, '', location.pathname) // reload shouldn't rejoin
  ui.lobby.hidden = true
  refreshControls()
  openMenu('')
  if (reason) showStatus(reason)
}

function openMenu(joinCode) {
  showMenu(ui.menu, { joinCode, rules: config.rules, handlers: { onPick: start, onJoin: (name) => join(joinCode, name) } })
}

function showStatus(text) {
  ui.status.textContent = text
  ui.status.hidden = false
}

// #CODE: invite link. ?map=<name>: play that map now, in its mode.
const joinCode = location.hash.slice(1).toUpperCase()
const linkedMap = new URLSearchParams(location.search).get('map')
refreshControls()
if (joinCode) openMenu(joinCode)
else if (maps[linkedMap]) start(maps[linkedMap].mode, loadName())
else openMenu('')
if (linkedMap && !maps[linkedMap]) showStatus(`No map "${linkedMap}". Maps: ${Object.keys(maps).join(', ')}`)
