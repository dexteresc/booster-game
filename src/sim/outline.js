// Outlines of shaped solids: a curve radius(angle) around (cx, cy), scaled by (sx, sy) to fill the rect.
// round: an ellipse. lumpy: a wobbly potato with a few crater bites out of its edge, seeded by the rect's
// size, so moving a rock keeps its shape and the host, the editor and the renderer all build the same one.

const TAU = Math.PI * 2
const STEPS = 512 // radius samples around a lumpy outline
const POINTS = 256 // polygon vertices
const CACHE_SIZE = 256 // the editor makes a new outline for every size a rock is dragged through
const cache = new Map() // `${shape} ${w}x${h}` → outline, least recently used first

// { cx, cy, sx, sy, radius(angle), points }, relative to the rect's top-left; points is the polygon.
export function outlineOf(shape, w, h) {
  const key = `${shape} ${w}x${h}`
  const outline = cache.get(key) ?? (shape === 'lumpy' ? lumpy(w, h) : withPoints({ cx: w / 2, cy: h / 2, sx: w / 2, sy: h / 2, radius: () => 1 }))
  cache.delete(key)
  cache.set(key, outline)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  return outline
}

// 0 at the outline's center, 1 on it, more outside. px, py relative to the rect's top-left.
export function reach({ cx, cy, sx, sy, radius }, px, py) {
  const a = (px - cx) / sx
  const b = (py - cy) / sy
  return Math.hypot(a, b) / radius(Math.atan2(b, a))
}

function withPoints(outline) {
  const { cx, cy, sx, sy, radius } = outline
  const points = Array.from({ length: POINTS }, (_, i) => {
    const a = (i / POINTS) * TAU
    return [cx + Math.cos(a) * radius(a) * sx, cy + Math.sin(a) * radius(a) * sy]
  })
  return { ...outline, points }
}

function lumpy(w, h) {
  const shape = potato(seeded(Math.round(w) * 7919 + Math.round(h) * 104729))
  const table = Float64Array.from({ length: STEPS }, (_, i) => shape((i / STEPS) * TAU))
  const radius = (angle) => {
    const t = (((angle / TAU) % 1) + 1) % 1 * STEPS
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
function potato(random) {
  const waves = Array.from({ length: 14 }, (_, i) => ({ k: i + 2, amp: 0.3 * (i + 2) ** -1.3 * (0.4 + random() * 0.6), phase: random() * TAU }))
  const bites = Array.from({ length: 1 + Math.floor(random() * 3) }, () => ({ at: random() * TAU, r: 0.15 + random() * 0.2, out: 0.3 + random() * 0.4 }))
  const base = (a) => waves.reduce((r, w) => r + w.amp * Math.cos(w.k * a + w.phase), 1)
  for (const b of bites) {
    const d = base(b.at) + b.r * b.out // bite center sits just outside the edge
    b.x = Math.cos(b.at) * d
    b.y = Math.sin(b.at) * d
  }
  return (a) => Math.max(0.35, bites.reduce((r, b) => bitten(a, r, b), base(a)))
}

// Where the ray at angle a now leaves the rock, if the bite's disc covers the old edge point.
function bitten(a, r, bite) {
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  if (Math.hypot(ux * r - bite.x, uy * r - bite.y) >= bite.r) return r
  const along = ux * bite.x + uy * bite.y
  const across = bite.x * bite.x + bite.y * bite.y - along * along
  return Math.min(r, along - Math.sqrt(Math.max(0, bite.r * bite.r - across)))
}

// mulberry32: small, fast, and the same everywhere.
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
