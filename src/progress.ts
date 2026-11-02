import type { GameView } from './sim/game.ts'
import { otherTeam } from './sim/game.ts'
import { readStoredJson, writeStored } from './storage.ts'

// Goals that unlock skins (src/art/skins.ts). Progress is counted from what this browser shows,
// so host and joiners count the same way, and it lives in this browser only: there is no server.

const STATS = ['captures', 'wins', 'matches', 'deaths', 'thrustSeconds'] as const
type Stat = (typeof STATS)[number]
export type Stats = Record<Stat, number>

export const GOALS = {
  'capture-1': { label: 'Capture a flag', stat: 'captures', target: 1 },
  'capture-5': { label: 'Capture 5 flags', stat: 'captures', target: 5 },
  'capture-20': { label: 'Capture 20 flags', stat: 'captures', target: 20 },
  'win-1': { label: 'Win a match', stat: 'wins', target: 1 },
  'win-5': { label: 'Win 5 matches', stat: 'wins', target: 5 },
  'match-3': { label: 'Finish 3 matches', stat: 'matches', target: 3 },
  'match-10': { label: 'Finish 10 matches', stat: 'matches', target: 10 },
  'crash-10': { label: 'Go down 10 times', stat: 'deaths', target: 10 },
  'crash-50': { label: 'Go down 50 times', stat: 'deaths', target: 50 },
  'fly-1m': { label: 'Burn the engines for 1 minute', stat: 'thrustSeconds', target: 60 },
  'fly-10m': { label: 'Burn the engines for 10 minutes', stat: 'thrustSeconds', target: 600 },
} as const satisfies Record<string, { label: string; stat: Stat; target: number }>

export type GoalId = keyof typeof GOALS

export const NO_STATS: Readonly<Stats> = Object.freeze({
  captures: 0, wins: 0, matches: 0, deaths: 0, thrustSeconds: 0,
})
const STATS_KEY = 'booster-stats'

export function reached(goal: GoalId, stats: Stats): boolean {
  return stats[GOALS[goal].stat] >= GOALS[goal].target
}

// How far along a goal is, for showing: "3/10".
export function progressText(goal: GoalId, stats: Stats): string {
  const { stat, target } = GOALS[goal]
  return `${Math.min(Math.floor(stats[stat]), target)}/${target}`
}

// Saved stats from other sessions: anything but a non-negative number falls back to 0.
export function cleanStats(raw: unknown): Stats {
  const stats = { ...NO_STATS }
  if (typeof raw !== 'object' || raw === null) return stats
  for (const stat of STATS) {
    const value = (raw as Record<string, unknown>)[stat]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) stats[stat] = value
  }
  return stats
}

// What the last frame showed, to spot what changed.
type Seen = { game: GameView; alive: boolean; carrying: boolean; score: number; winner: boolean }

// Progress kept in this browser's storage. ?unlock in the URL: everything unlocked, nothing saved (for testing skins).
export function storedProgress() {
  if (new URLSearchParams(location.search).has('unlock')) {
    const all = Object.fromEntries(STATS.map((stat) => [stat, Infinity])) as Stats
    return createProgress(all, () => {})
  }
  return createProgress(cleanStats(readStoredJson(STATS_KEY)), (stats) => writeStored(STATS_KEY, JSON.stringify(stats)))
}

const ALL_GOALS = Object.keys(GOALS) as GoalId[]
const whole = (stats: Stats) => STATS.map((stat) => Math.floor(stats[stat])).join()

// Feed every drawn frame; returns the goals that frame reached. onChange fires when a whole number changes
// (thrust time ticks up every frame). A new game (another object) starts fresh.
export function createProgress(stats: Stats, onChange: (stats: Stats) => void) {
  let seen: Seen | null = null

  return {
    stats,
    observe(game: GameView, localId: string, dt: number): GoalId[] {
      const me = game.rockets.find((r) => r.id === localId)
      if (!me) return []
      const had = new Set(ALL_GOALS.filter((goal) => reached(goal, stats)))
      const was = whole(stats)
      const now = {
        game,
        alive: me.alive,
        carrying: game.teams[otherTeam(me.team)].flagCarrier === me.id,
        score: game.teams[me.team].score,
        winner: game.winner !== null,
      }
      if (seen?.game === game) count(stats, seen, now, game.winner === me.team)
      if (me.alive && (me.input.left || me.input.right)) stats.thrustSeconds += dt
      seen = now
      if (whole(stats) !== was) onChange(stats)
      return ALL_GOALS.filter((goal) => reached(goal, stats) && !had.has(goal))
    },
  }
}

// What happened between two frames of the same game.
function count(stats: Stats, last: Seen, now: Seen, iWon: boolean): void {
  if (last.alive && !now.alive) stats.deaths++
  if (last.carrying && now.score > last.score) stats.captures++
  if (!last.winner && now.winner) stats.matches++
  if (!last.winner && iWon) stats.wins++
}
