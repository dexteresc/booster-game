import { outlineOf, reach } from './outline.js'

// Outside the map counts as solid. y = -Infinity makes a foot "sink" infinitely
// deep, so touching the map edge is always a crash.
const OUT_OF_BOUNDS = { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity }

export function solidAt(map, x, y) {
  if (x < 0 || y < 0 || x > map.width || y > map.height) return OUT_OF_BOUNDS
  return map.solids.find((s) => inside(s, x, y)) ?? null
}

// A spinning solid has an `angle` it is turned by about its rect's center, clockwise.
function inside(s, x, y) {
  if (!s.angle) return insideUpright(s, x, y)
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  const [dx, dy] = rotate(x - cx, y - cy, -s.angle)
  return insideUpright(s, cx + dx, cy + dy)
}

function insideUpright(s, x, y) {
  if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false
  return !s.shape || reach(outlineOf(s.shape, s.w, s.h), x - s.x, y - s.y) <= 1
}

// The top a rocket can stand on at x: its height and steepness as rise over run (1 = 45°).
// Nothing stands on the sea or on a spinning solid.
export function topAt(s, x) {
  if (s.kind === 'water' || s.spin) return null
  if (!s.shape) return { y: s.y, slope: 0 }
  const top = topEdge(outlineOf(s.shape, s.w, s.h).points, x - s.x)
  return { y: s.y + top.y, slope: top.slope }
}

function topEdge(points, px) {
  let y = Infinity
  let slope = Infinity
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    if (px < x0 === px < x1) continue
    const at = y0 + ((px - x0) / (x1 - x0)) * (y1 - y0)
    if (at < y) [y, slope] = [at, Math.abs((y1 - y0) / (x1 - x0))]
  }
  return { y, slope }
}

// Clockwise with y pointing down, as the canvas turns things.
export function rotate(x, y, angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}
