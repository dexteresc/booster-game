import type { Shape } from '../maps/parse.ts'

// Outlines of shaped solids: a curve radius(angle) around (cx, cy), scaled by (sx, sy) to fill the rect.
// round: an ellipse. lumpy: a wobbly potato with a few crater bites out of its edge, seeded by the rect's
// size, so moving a rock keeps its shape and the host, the editor and the renderer all build the same one.

type Point = [x: number, y: number]
type Curve = { cx: number; cy: number; sx: number; sy: number; radius: (angle: number) => number }
export type Outline = Curve & { points: Point[] } // points: the polygon
type Bite = { at: number; r: number; out: number; x: number; y: number }

const TAU = Math.PI * 2
const STEPS = 512 // radius samples around a lumpy outline
const POINTS = 256 // polygon vertices
const CACHE_SIZE = 256 // the editor makes a new outline for every size a rock is dragged through
const cache = new Map<string, Outline>() // `${shape} ${w}x${h}` → outline; emptied when full

// Relative to the rect's top-left.
export function outlineOf(shape: Shape, w: number, h: number): Outline {
  const key = `${shape} ${w}x${h}`
  const known = cache.get(key)
  if (known) return known
  if (cache.size >= CACHE_SIZE) cache.clear()
  const outline = shape === 'lumpy' ? lumpy(w, h) : ellipse(w, h)
  cache.set(key, outline)
  return outline
}

// 0 at the outline's center, 1 on it, more outside. px, py relative to the rect's top-left.
export function reach({ cx, cy, sx, sy, radius }: Curve, px: number, py: number): number {
  const a = (px - cx) / sx
  const b = (py - cy) / sy
  return Math.sqrt(a * a + b * b) / radius(Math.atan2(b, a))
}

function ellipse(w: number, h: number): Outline {
  return withPoints({ cx: w / 2, cy: h / 2, sx: w / 2, sy: h / 2, radius: () => 1 })
}

function withPoints(curve: Curve): Outline {
  const { cx, cy, sx, sy, radius } = curve
  const points = Array.from({ length: POINTS }, (_, i): Point => {
    const a = (i / POINTS) * TAU
    return [cx + Math.cos(a) * radius(a) * sx, cy + Math.sin(a) * radius(a) * sy]
  })
  return { ...curve, points }
}

function lumpy(w: number, h: number): Outline {
  const shape = potato(seeded(Math.round(w) * 7919 + Math.round(h) * 104729))
  const table = Float64Array.from({ length: STEPS }, (_, i) => shape((i / STEPS) * TAU))
  const radius = (angle: number) => {
    const t = ((((angle / TAU) % 1) + 1) % 1) * STEPS
    const i = Math.floor(t)
    return table[i] + (table[(i + 1) % STEPS] - table[i]) * (t - i)
  }
  const xs = Array.from(table, (r, i) => r * Math.cos((i / STEPS) * TAU))
  const ys = Array.from(table, (r, i) => r * Math.sin((i / STEPS) * TAU))
  const sx = w / (Math.max(...xs) - Math.min(...xs))
  const sy = h / (Math.max(...ys) - Math.min(...ys))
  const cx = -Math.min(...xs) * sx
  const cy = -Math.min(...ys) * sy
  return withPoints({ cx, cy, sx, sy, radius })
}

// Radius by angle: harmonics for the overall lumpy form and a craggy edge, then circular bites.
function potato(random: () => number) {
  const waves = Array.from({ length: 14 }, (_, i) => ({
    k: i + 2,
    amp: 0.3 * (i + 2) ** -1.3 * (0.4 + random() * 0.6),
    phase: random() * TAU,
  }))
  const base = (a: number) => waves.reduce((r, wave) => r + wave.amp * Math.cos(wave.k * a + wave.phase), 1)
  const bites = Array.from({ length: 1 + Math.floor(random() * 3) }, (): Bite => {
    const bite = { at: random() * TAU, r: 0.15 + random() * 0.2, out: 0.3 + random() * 0.4 }
    const d = base(bite.at) + bite.r * bite.out // bite center sits just outside the edge
    return { ...bite, x: Math.cos(bite.at) * d, y: Math.sin(bite.at) * d }
  })
  return (a: number) => Math.max(0.35, bites.reduce((r, bite) => bitten(a, r, bite), base(a)))
}

// Where the ray at angle now leaves the rock, if the bite's disc covers the old edge point.
function bitten(angle: number, radius: number, bite: Bite) {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  if (Math.hypot(ux * radius - bite.x, uy * radius - bite.y) >= bite.r) return radius
  const along = ux * bite.x + uy * bite.y
  const across = bite.x * bite.x + bite.y * bite.y - along * along
  return Math.min(radius, along - Math.sqrt(Math.max(0, bite.r * bite.r - across)))
}

// mulberry32: small, fast, and the same everywhere.
export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
