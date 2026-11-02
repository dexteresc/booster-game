import type { GoalId } from '../progress.ts'
import type { Palette } from './theme.ts'
import { GOALS } from '../progress.ts'
import { COLOR } from './theme.ts'

// What a player's rocket can look like. Every part has a free option and ones a goal unlocks
// (src/progress.ts). Looks are drawn in sprites.ts (body, paint, flame) and trail.ts (trail).
// Cosmetic only: the hull that crashes is the same for every body (sim/rocket.ts HULL).

type Option = { label: string; unlock: GoalId | null }
// SVG path, same width (±8) and bottom (y 9) as the classic hull so pods and legs fit; tip: nose y.
type Body = Option & { path: string; tip: number }
type Paint = Option & { hull: Palette | null } // null: the team's colors
type Flame = Option & { colors: readonly [nozzle: string, mid: string, tip: string] }
type Trail = Option & { kind: 'exhaust' | 'rainbow' | 'petals' | 'ash' | 'glitter' }

export const SKINS = {
  body: {
    classic: { label: 'Classic', unlock: null, tip: -26, path: 'M0 -26 C5 -22 8 -14 8 -6 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 L-8 -6 C-8 -14 -5 -22 0 -26 Z' },
    needle: { label: 'Needle', unlock: 'capture-5', tip: -36, path: 'M0 -36 C2 -30 8 -18 8 -6 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 L-8 -6 C-8 -18 -2 -30 0 -36 Z' },
    bulb: { label: 'Bulb', unlock: 'crash-10', tip: -24, path: 'M0 -24 C7 -24 10 -16 10 -8 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 L-10 -8 C-10 -16 -7 -24 0 -24 Z' },
    fin: { label: 'Dart', unlock: 'capture-20', tip: -30, path: 'M0 -30 C4 -26 6 -18 6 -10 L8 -2 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 L-8 -2 L-6 -10 C-6 -18 -4 -26 0 -30 Z' },
  },
  paint: {
    team: { label: 'Team', unlock: null, hull: null },
    cherry: { label: 'Cherry', unlock: 'capture-1', hull: ['#ff7b76', '#d63a33', '#7a1a16'] },
    mint: { label: 'Mint', unlock: 'fly-1m', hull: ['#d8ffee', '#7fd9b0', '#35805f'] },
    midnight: { label: 'Midnight', unlock: 'match-3', hull: ['#6a7ab8', '#2f3a72', '#141a3a'] },
    bubblegum: { label: 'Bubblegum', unlock: 'crash-10', hull: ['#ffd9ee', '#ff8fc8', '#b34884'] },
    gold: { label: 'Gold', unlock: 'win-1', hull: ['#fff3b0', '#e6b93e', '#8c6716'] },
    jet: { label: 'Jet', unlock: 'win-5', hull: ['#70707a', '#30303a', '#111114'] },
  },
  flame: {
    classic: { label: 'Classic', unlock: null, colors: COLOR.flame },
    azure: { label: 'Azure', unlock: 'fly-1m', colors: ['rgba(235,250,255,1)', 'rgba(80,170,255,0.9)', 'rgba(30,60,255,0)'] },
    emerald: { label: 'Emerald', unlock: 'capture-1', colors: ['rgba(240,255,240,1)', 'rgba(90,255,150,0.9)', 'rgba(0,160,70,0)'] },
    violet: { label: 'Violet', unlock: 'match-3', colors: ['rgba(250,235,255,1)', 'rgba(190,100,255,0.9)', 'rgba(110,20,220,0)'] },
    pink: { label: 'Pink', unlock: 'crash-50', colors: ['rgba(255,240,250,1)', 'rgba(255,110,190,0.9)', 'rgba(255,30,120,0)'] },
    white: { label: 'Plasma', unlock: 'win-1', colors: ['rgba(255,255,255,1)', 'rgba(200,230,255,0.9)', 'rgba(120,180,255,0)'] },
  },
  trail: {
    exhaust: { label: 'Exhaust', unlock: null, kind: 'exhaust' },
    ash: { label: 'Ash', unlock: 'crash-10', kind: 'ash' },
    glitter: { label: 'Glitter', unlock: 'fly-10m', kind: 'glitter' },
    petals: { label: 'Petals', unlock: 'match-10', kind: 'petals' },
    rainbow: { label: 'Rainbow', unlock: 'win-5', kind: 'rainbow' },
  },
} as const satisfies {
  body: Record<string, Body>
  paint: Record<string, Paint>
  flame: Record<string, Flame>
  trail: Record<string, Trail>
}

export type SkinPart = keyof typeof SKINS
export type Skin = { [P in SkinPart]: keyof (typeof SKINS)[P] }
export const SKIN_PARTS = Object.keys(SKINS) as SkinPart[]
export const DEFAULT_SKIN: Readonly<Skin> = Object.freeze({ body: 'classic', paint: 'team', flame: 'classic', trail: 'exhaust' })

// Skins come from storage and from other browsers: an unknown part option becomes the default.
export function cleanSkin(raw: unknown): Skin {
  const skin = { ...DEFAULT_SKIN }
  if (typeof raw !== 'object' || raw === null) return skin
  for (const part of SKIN_PARTS) {
    const value = (raw as Record<string, unknown>)[part]
    if (typeof value === 'string' && Object.hasOwn(SKINS[part], value)) (skin as Record<SkinPart, string>)[part] = value
  }
  return skin
}

// For the status line when a goal is reached.
export function unlockMessage(goal: GoalId): string {
  const unlocked = SKIN_PARTS.flatMap((part) =>
    Object.values<Option>(SKINS[part]).filter((option) => option.unlock === goal).map((option) => `${option.label} ${part}`),
  )
  return `${GOALS[goal].label}: unlocked ${unlocked.join(', ')}. Pick it in the menu.`
}
