import { config } from './config.js'
import { DEFAULT_MAP, maps } from './maps/index.js'
import { addPlayer, createGame, maxPlayersPerTeam, removePlayer, snapshotOf, step } from './sim/game.js'
import { createLocalInput } from './input.js'
import { createRenderer } from './render.js'
import { createTuningPanel } from './tuning.js'
import { hostRoom, joinRoom } from './net.js'

const LOCAL_ID = 'host'
const TEAM = 'blue' // co-op vs CPU: everyone is blue. PvP would assign red here.
const RESTART_DELAY = 4
const SNAPSHOT_EVERY = 4 // ticks → 30 Hz at 120 tick rate

const canvas = document.querySelector('canvas')
const status = document.getElementById('status')
const inviteButton = document.getElementById('invite')
const mapSelect = document.getElementById('map')
const input = createLocalInput(canvas, config.keys)
const draw = createRenderer(canvas, config)
createTuningPanel(config)
const mapName = pickMap()
const map = maps[mapName]

let game = createGame(map, [{ id: LOCAL_ID, team: TEAM }])
let localId = LOCAL_ID
let room = null // set while hosting: { code, broadcast }
let client = null // set while joined: { id, sendInput }
const remoteInputs = {}
let pending = 0
let ticksSinceSnapshot = 0
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
  else runSim(elapsed, local)
}

let lastFrame = performance.now()
requestAnimationFrame(function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.25)
  lastFrame = now
  advance()
  draw(game, localId, drawEvents, elapsed)
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
    room.broadcast({ type: 'snapshot', ...snapshotOf(game), events: unsentEvents })
    ticksSinceSnapshot = 0
    unsentEvents = []
  }
  if (game.winner && game.time - game.wonAt > RESTART_DELAY) {
    game = createGame(map, game.rockets.map(({ id, team }) => ({ id, team })))
  }
}

inviteButton.onclick = async () => {
  if (!room) {
    inviteButton.disabled = true
    try {
      room = await hostRoom({
        onJoin(id) {
          if (game.rockets.filter((r) => r.team === TEAM).length >= maxPlayersPerTeam(game, TEAM)) return false
          addPlayer(game, { id, team: TEAM })
          return true
        },
        onLeave(id) {
          removePlayer(game, id)
          delete remoteInputs[id]
        },
        onInput(id, playerInput) {
          remoteInputs[id] = playerInput
        },
        onError(err) {
          console.error('Host network error', err)
          showStatus(`Network error: ${err.message}`)
        },
      })
    } catch (err) {
      console.error('Creating room failed', err)
      showStatus(`Couldn't create room: ${err.message}`)
      return
    } finally {
      inviteButton.disabled = false
    }
  }
  const link = `${location.origin}${location.pathname}?map=${mapName}#${room.code}`
  try {
    await navigator.clipboard.writeText(link)
    showStatus(`Room ${room.code} · link copied: ${link}`)
  } catch (err) {
    console.error('Clipboard write failed', err)
    showStatus(`Room ${room.code} · share this link: ${link}`)
  }
}

const joinCode = location.hash.slice(1).toUpperCase()
if (joinCode) join(joinCode)

async function join(code) {
  inviteButton.hidden = true
  mapSelect.hidden = true
  showStatus(`Joining ${code}…`)
  game = createGame(map, []) // filled by the host's snapshots
  try {
    client = await joinRoom(code, {
      onSnapshot(snapshot) {
        Object.assign(game, snapshot)
        drawEvents.push(...snapshot.events)
      },
      onClose: backToSolo,
    })
    localId = client.id
    showStatus(`Joined room ${code}`)
  } catch (err) {
    console.error(`Joining ${code} failed`, err)
    backToSolo(`Couldn't join ${code}: ${err.message}`)
  }
}

function backToSolo(reason) {
  client = null
  history.replaceState(null, '', location.pathname + location.search) // reload shouldn't rejoin
  game = createGame(map, [{ id: LOCAL_ID, team: TEAM }])
  localId = LOCAL_ID
  inviteButton.hidden = false
  mapSelect.hidden = false
  showStatus(reason)
}

function showStatus(text) {
  status.textContent = text
  status.hidden = false
}

// ?map=<name> picks the map; invite links carry it so joiners load the same one.
function pickMap() {
  const wanted = new URLSearchParams(location.search).get('map') ?? DEFAULT_MAP
  const name = maps[wanted] ? wanted : DEFAULT_MAP
  if (name !== wanted) showStatus(`No map "${wanted}", playing ${name}. Maps: ${Object.keys(maps).join(', ')}`)
  mapSelect.replaceChildren(...Object.keys(maps).map((n) => new Option(n, n, false, n === name)))
  mapSelect.onchange = () => {
    location.href = `${location.pathname}?map=${encodeURIComponent(mapSelect.value)}`
  }
  return name
}
