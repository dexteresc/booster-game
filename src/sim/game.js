import { FOOT_Y, NO_INPUT, spawnRocket, stepRocket } from './rocket.js'
import { cannonPedestal, stepBullets, stepCannons } from './cannon.js'

// Pure simulation: no DOM, no randomness, fixed timestep. Same inputs → same
// state, so it can run unchanged on a server or in lockstep between peers.
// All state is plain data (JSON-serializable) for snapshots over the network.

export const FLAG_HEIGHT = 40
// PvE: players are blue, the computer is red and only has turrets. PvP: both teams are players.
export const CPU_TEAM = 'red'

// PvE has one flag, the computer's: players steal it, the computer scores by shooting players down.
export function hasFlag(mode, team) {
  return mode === 'pvp' || team === CPU_TEAM
}

// players: [{ id, team, name }]. Teams come from map.bases.
export function createGame(map, players, mode = 'pve') {
  const pads = Object.values(map.bases).map((b) => b.pad)
  const game = {
    mode,
    time: 0,
    winner: null,
    wonAt: null,
    events: [], // this tick only: { type: 'explode' | 'capture', ... }
    map: { ...map, solids: [...map.solids, ...pads, ...map.cannons.map(cannonPedestal)] },
    teams: Object.fromEntries(Object.keys(map.bases).map((team) => [team, { score: 0, flagCarrier: null, flag: hasFlag(mode, team) }])),
    rockets: [],
    cannons: map.cannons.map((c) => ({ ...c, aim: -Math.PI / 2, cooldown: 0 })),
    bullets: [],
  }
  for (const p of players) addPlayer(game, p)
  return game
}

// Spawn slots are spaced along the team's pad; a leaving player frees theirs.
export function maxPlayersPerTeam(game, team) {
  return Math.floor((game.map.bases[team].pad.w - 40) / 40) + 1
}

export function addPlayer(game, { id, team, name = '' }) {
  const taken = new Set(game.rockets.filter((r) => r.team === team).map((r) => r.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  if (slot >= maxPlayersPerTeam(game, team)) throw new Error(`Team ${team} is full, can't add player ${id}`)
  const rocket = { id, team, name, slot }
  spawnRocket(rocket, game.map.bases[team].pad)
  game.rockets.push(rocket)
}

export function removePlayer(game, id) {
  for (const team of Object.values(game.teams)) if (team.flagCarrier === id) team.flagCarrier = null
  game.rockets = game.rockets.filter((r) => r.id !== id)
}

// Everything that changes during play (map is static and rebuilt by each client).
export function snapshotOf(game) {
  const { time, winner, wonAt, teams, rockets, cannons, bullets } = game
  return { time, winner, wonAt, teams, rockets, cannons, bullets }
}

// Foot of the flag pole when the flag is home.
export function flagHome(base) {
  return { x: base.pad.x + base.pad.w / 2, y: base.pad.y }
}

// inputs: { [playerId]: { left, right } }
export function step(game, inputs, config) {
  const dt = 1 / config.tickRate
  game.time += dt
  game.events = []

  for (const rocket of game.rockets) {
    if (!rocket.alive) {
      if (game.time >= rocket.respawnAt) spawnRocket(rocket, game.map.bases[rocket.team].pad)
      continue
    }
    rocket.input = inputs[rocket.id] ?? NO_INPUT
    if (stepRocket(rocket, game.map, config, dt)) kill(game, rocket, config)
  }

  stepCannons(game, config, dt)
  for (const rocket of stepBullets(game, config, dt)) {
    kill(game, rocket, config)
    if (game.mode === 'pve' && !game.winner) score(game, CPU_TEAM, config.rules.cpuKillsToWin)
  }
  if (!game.winner) updateFlags(game, config)
}

function score(game, team, toWin) {
  game.teams[team].score++
  if (game.teams[team].score < toWin) return
  game.winner = team
  game.wonAt = game.time
}

function kill(game, rocket, config) {
  if (!rocket.alive) return
  rocket.alive = false
  rocket.respawnAt = game.time + config.rules.respawnSeconds
  game.events.push({ type: 'explode', x: rocket.x, y: rocket.y, team: rocket.team })
  // Dropped flag goes straight home.
  for (const team of Object.values(game.teams)) if (team.flagCarrier === rocket.id) team.flagCarrier = null
}

function updateFlags(game, config) {
  const { flagPickupRadius, capturesToWin } = config.rules
  for (const rocket of game.rockets) {
    if (!rocket.alive) continue
    pickUpFlags(game, rocket, flagPickupRadius)
    tryCapture(game, rocket, capturesToWin)
  }
}

function pickUpFlags(game, rocket, radius) {
  for (const [name, team] of Object.entries(game.teams)) {
    if (name === rocket.team || !team.flag || team.flagCarrier !== null) continue
    const flag = flagHome(game.map.bases[name])
    if (Math.hypot(rocket.x - flag.x, rocket.y - (flag.y - FLAG_HEIGHT / 2)) < radius) team.flagCarrier = rocket.id
  }
}

// Capture: land on your own pad with their flag while yours (if you have one) is home.
function tryCapture(game, rocket, capturesToWin) {
  const own = game.teams[rocket.team]
  const carried = Object.values(game.teams).find((t) => t.flagCarrier === rocket.id)
  if (!carried || own.flagCarrier !== null || !rocket.landed || !onPad(rocket, game.map.bases[rocket.team].pad)) return
  carried.flagCarrier = null
  game.events.push({ type: 'capture', team: rocket.team })
  score(game, rocket.team, capturesToWin)
}

function onPad(rocket, pad) {
  return rocket.x >= pad.x && rocket.x <= pad.x + pad.w && Math.abs(rocket.y + FOOT_Y - pad.y) < 1
}
