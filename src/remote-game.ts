import type { GameMap } from './maps/parse.ts'
import type { GameEvent, GameView, ShownRocket } from './sim/game.ts'
import type { RosterMessage } from './net.ts'
import type { Snapshot } from './snapshot.ts'
import { createGame, teamEntries } from './sim/game.ts'
import { NO_INPUT } from './sim/rocket.ts'
import { wrapAngle } from './sim/geometry.ts'
import { decodeSnapshot } from './snapshot.ts'

// A joiner's copy of the host's game. Snapshots land ~20×/s with network jitter, so drawing each
// as it arrives stutters. Instead the joiner shows a moment DELAY_SECONDS behind the newest snapshot and
// blends the two snapshots around it. Events (explosions, captures) fire when that moment reaches them.
const DELAY_SECONDS = 0.1 // two snapshot intervals. More = smoother on bad networks, but laggier
// Host-to-local clock offset: the quickest arrival in the last LAG_WINDOW_SECONDS seconds, so it follows
// clock drift and route changes. Shown time slides toward it at most SLEW s/s (replay runs ≤2% fast
// or slow), never jumps.
const LAG_WINDOW_SECONDS = 2
const SLEW = 0.02
const STALE_EVENTS_SECONDS = 0.5 // events this far behind (tab was hidden) are dropped, not replayed

export function createRemoteGame() {
  let game: (GameView & { mapName: string }) | null = null
  let ids: string[] = [] // rocket ids in roster order, how snapshots list them
  let timeline = createTimeline()
  return {
    get game() {
      return game
    },
    // A new match, or players joined, left or switched team.
    roster(map: GameMap, { mapName, mode, players }: RosterMessage) {
      if (game?.mapName !== mapName || game.mode !== mode) {
        game = { ...createGame(map, [], mode), mapName }
        timeline = createTimeline()
      }
      const old = new Map(game.rockets.map((r) => [r.id, r]))
      game.rockets = players.map(({ id, ...pilot }) => ({ ...(old.get(id) ?? hiddenRocket(id)), ...pilot }))
      ids = players.map((p) => p.id)
    },
    snapshot(buffer: ArrayBuffer, now: number) {
      if (!game) throw new Error('Snapshot before any roster message')
      timeline.push(decodeSnapshot(buffer, ids), now)
    },
    end() {
      game = null
    },
    // Moves game to how it looked DELAY_SECONDS ago. Returns the events due since the last call.
    show(now: number): GameEvent[] {
      return game ? timeline.show(game, now) : []
    },
  }
}

function hiddenRocket(id: string): Omit<ShownRocket, 'team' | 'name' | 'skin'> {
  return { id, x: 0, y: 0, angle: 0, alive: false, respawnAt: 0, input: NO_INPUT }
}

function createTimeline() {
  let snapshots: Snapshot[] = [] // oldest first
  let events: { time: number; event: GameEvent }[] = [] // not yet shown
  let lags: { now: number; lag: number }[] = [] // recent arrivals: local clock minus host clock
  let offset: number | null = null // the one in use
  let shownAt = 0
  return {
    push(snapshot: Snapshot, now: number) {
      // A new match restarts the host's clock.
      if (snapshot.time < (snapshots.at(-1)?.time ?? 0)) [snapshots, events, lags, offset] = [[], [], [], null]
      lags = lags.filter((l) => l.now > now - LAG_WINDOW_SECONDS)
      lags.push({ now, lag: now - snapshot.time })
      snapshots.push(snapshot)
      for (const event of snapshot.events) events.push({ time: snapshot.time, event })
    },
    show(game: GameView, now: number): GameEvent[] {
      if (!snapshots.length) return []
      const target = Math.min(...lags.map((l) => l.lag))
      const slew = SLEW * Math.max(0, now - shownAt)
      offset = offset === null ? target : offset + Math.min(Math.max(target - offset, -slew), slew)
      shownAt = now
      const at = now - offset - DELAY_SECONDS
      while (snapshots.length > 1 && snapshots[1].time <= at) snapshots.shift()
      blend(game, snapshots[0], snapshots[1], at)
      const due = events.filter((e) => e.time <= at)
      events = events.filter((e) => e.time > at)
      return due.filter((e) => e.time > at - STALE_EVENTS_SECONDS).map((e) => e.event)
    },
  }
}

// Writes game as of host time `at`, between snapshots from and next (next: undefined = none newer yet, hold).
// Everything discrete (alive, scores, who carries a flag) comes from `from`, so it matches the positions.
export function blend(game: GameView, from: Snapshot, next: Snapshot | undefined, at: number): void {
  const to = next ?? from
  const t = to.time > from.time ? Math.min(Math.max((at - from.time) / (to.time - from.time), 0), 1) : 0
  const since = Math.max(0, at - from.time)
  game.time = from.time + since
  game.winner = from.winner
  for (const [team, state] of teamEntries(from.teams)) Object.assign(game.teams[team], state)
  for (const rocket of game.rockets) blendRocket(rocket, from.rockets, to.rockets, t)
  from.cannons.forEach((c, i) => {
    game.cannons[i].aim = lerpAngle(c.aim, to.cannons[i].aim, t)
    game.cannons[i].cooldown = c.cooldown - since
  })
  // Bullets fly straight, so they move on from where `from` saw them.
  game.bullets = from.bullets.map((b) => ({ ...b, x: b.x + b.vx * since, y: b.y + b.vy * since }))
}

function blendRocket(rocket: ShownRocket, fromRockets: Snapshot['rockets'], toRockets: Snapshot['rockets'], fraction: number): void {
  const a = fromRockets.find((r) => r.id === rocket.id)
  if (!a) return
  const b = toRockets.find((r) => r.id === rocket.id)
  Object.assign(rocket, a)
  if (!a.alive || !b?.alive) return // dying or respawning: no sliding across the map
  rocket.x = a.x + (b.x - a.x) * fraction
  rocket.y = a.y + (b.y - a.y) * fraction
  rocket.angle = lerpAngle(a.angle, b.angle, fraction)
}

const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t
