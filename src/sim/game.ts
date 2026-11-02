import type { Config } from '../config.ts'
import type { Base, GameMap, Mode, Rect, Team } from '../maps/parse.ts'
import type { Skin } from '../art/skins.ts'
import type { Bullet, Cannon } from './cannon.ts'
import type { PlacedSolid } from './geometry.ts'
import type { Input, Rocket } from './rocket.ts'
import { FOOT_Y, NO_INPUT, SLOT_SPACING, spawnState, stepRocket } from './rocket.ts'
import { cannonPedestal, restingAim, stepBullets, stepCannons } from './cannon.ts'

// Pure simulation: no DOM, no randomness, fixed timestep. Same inputs → same
// state, so it can run unchanged on a server or in lockstep between peers.
// All state is plain data; src/snapshot.ts packs what joiners need into bytes.

type NewPlayer = { id: string; team: Team; name?: string; skin: Skin }

type TeamState = {
  score: number
  flagCarrier: string | null // rocket id
  flag: boolean // whether this team has a flag at all, see hasFlag
}

export type GameEvent = { type: 'explode'; team: Team; x: number; y: number } | { type: 'capture'; team: Team; x?: number; y?: number }

export type Game = {
  mode: Mode
  time: number
  winner: Team | null
  wonAt: number | null
  events: GameEvent[] // this tick only
  map: Omit<GameMap, 'solids'> & { solids: PlacedSolid[] } // solids include pads and cannon pedestals
  teams: Record<Team, TeamState>
  rockets: Rocket[]
  cannons: Cannon[]
  bullets: Bullet[]
}

// What the screen needs. The host's Game fits; a joiner's copy, rebuilt from snapshots, has only this.
export type ShownRocket = Pick<Rocket, 'id' | 'team' | 'name' | 'skin' | 'x' | 'y' | 'angle' | 'alive' | 'respawnAt' | 'input'>
export type ShownBullet = Omit<Bullet, 'life'>
export type GameView = Omit<Game, 'rockets' | 'bullets'> & { rockets: ShownRocket[]; bullets: ShownBullet[] }

export const FLAG_HEIGHT = 40
// PvE: players are blue, the computer is red and only has turrets. PvP: both teams are players.
const CPU_TEAM = 'red'

// PvE has one flag, the computer's: players steal it, the computer scores by shooting players down.
export function hasFlag(mode: Mode, team: Team): boolean {
  return mode === 'pvp' || team === CPU_TEAM
}

// Teams come from map.bases.
export function createGame(map: GameMap, players: NewPlayer[], mode: Mode = 'pve'): Game {
  const pads = Object.values(map.bases).map((b) => b.pad)
  const pedestals = map.cannons.map(cannonPedestal)
  const game: Game = {
    mode,
    time: 0,
    winner: null,
    wonAt: null,
    events: [],
    map: { ...map, solids: [...map.solids.map((s) => (s.spin ? { ...s, angle: 0 } : s)), ...pads, ...pedestals] },
    teams: teamRecord(map.bases, (team) => ({ score: 0, flagCarrier: null, flag: hasFlag(mode, team) })),
    rockets: [],
    cannons: map.cannons.map((c) => ({ ...c, aim: restingAim(c), cooldown: 0 })),
    bullets: [],
  }
  for (const p of players) addPlayer(game, p)
  return game
}

// A per-team record built from another one's teams.
function teamRecord<T>(teams: Record<Team, Base>, make: (team: Team) => T): Record<Team, T> {
  return Object.fromEntries(teamEntries(teams).map(([team]) => [team, make(team)])) as Record<Team, T>
}

export function otherTeam(team: Team): Team {
  return team === 'blue' ? 'red' : 'blue'
}

// Object.entries for a per-team record, keeping the keys typed as Team.
export function teamEntries<T>(record: Record<Team, T>): [Team, T][] {
  return Object.entries(record) as [Team, T][]
}

// Spawn slots are spaced along the team's pad; a leaving player frees theirs.
export function maxPlayersPerTeam(game: Pick<Game, 'map'>, team: Team): number {
  return Math.floor(game.map.bases[team].pad.w / SLOT_SPACING)
}

export function addPlayer(game: Game, { id, team, name = '', skin }: NewPlayer): void {
  const taken = new Set(game.rockets.filter((r) => r.team === team).map((r) => r.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  if (slot >= maxPlayersPerTeam(game, team)) throw new Error(`Team ${team} is full, can't add player ${id}`)
  game.rockets.push({ id, team, name, skin, slot, respawnAt: 0, ...spawnState(slot, game.map.bases[team].pad) })
}

export function removePlayer(game: Game, id: string): void {
  for (const team of Object.values(game.teams)) {
    if (team.flagCarrier === id) team.flagCarrier = null
  }
  game.rockets = game.rockets.filter((r) => r.id !== id)
}

// Spinning solids as they stand at game.time. Joiners call this too: they never step.
export function turnSolids(game: Pick<Game, 'map' | 'time'>): void {
  for (const s of game.map.solids) {
    if (s.spin) s.angle = s.spin * game.time
  }
}

// Foot of the flag pole when the flag is home.
export function flagHome(base: Base): { x: number; y: number } {
  return { x: base.pad.x + base.pad.w / 2, y: base.pad.y }
}

// inputs: by player id; a player without one has no engines on.
export function step(game: Game, inputs: Record<string, Input>, config: Config): void {
  const dt = 1 / config.tickRate
  game.time += dt
  game.events = []
  turnSolids(game)

  for (const rocket of game.rockets) {
    if (!rocket.alive) {
      if (game.time >= rocket.respawnAt) Object.assign(rocket, spawnState(rocket.slot, game.map.bases[rocket.team].pad))
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

function score(game: Game, team: Team, toWin: number): void {
  game.teams[team].score++
  if (game.teams[team].score < toWin) return
  game.winner = team
  game.wonAt = game.time
}

function kill(game: Game, rocket: Rocket, config: Config): void {
  if (!rocket.alive) return
  rocket.alive = false
  rocket.respawnAt = game.time + config.rules.respawnSeconds
  game.events.push({ type: 'explode', x: rocket.x, y: rocket.y, team: rocket.team })
  // Dropped flag goes straight home.
  for (const team of Object.values(game.teams)) {
    if (team.flagCarrier === rocket.id) team.flagCarrier = null
  }
}

function updateFlags(game: Game, config: Config): void {
  const { flagPickupRadius, capturesToWin } = config.rules
  for (const rocket of game.rockets) {
    if (!rocket.alive) continue
    pickUpFlags(game, rocket, flagPickupRadius)
    tryCapture(game, rocket, capturesToWin)
  }
}

function pickUpFlags(game: Game, rocket: Rocket, radius: number): void {
  for (const [name, team] of teamEntries(game.teams)) {
    if (name === rocket.team || !team.flag || team.flagCarrier !== null) continue
    const flag = flagHome(game.map.bases[name])
    if (Math.hypot(rocket.x - flag.x, rocket.y - (flag.y - FLAG_HEIGHT / 2)) < radius) team.flagCarrier = rocket.id
  }
}

// Capture: land on your own pad with their flag while yours (if you have one) is home.
function tryCapture(game: Game, rocket: Rocket, capturesToWin: number): void {
  const own = game.teams[rocket.team]
  const carried = Object.values(game.teams).find((t) => t.flagCarrier === rocket.id)
  if (!carried || own.flagCarrier !== null || !rocket.landed || !onPad(rocket, game.map.bases[rocket.team].pad)) return
  carried.flagCarrier = null
  game.events.push({ type: 'capture', team: rocket.team })
  score(game, rocket.team, capturesToWin)
}

function onPad(rocket: Rocket, pad: Rect): boolean {
  return rocket.x >= pad.x && rocket.x <= pad.x + pad.w && Math.abs(rocket.y + FOOT_Y - pad.y) < 1
}
