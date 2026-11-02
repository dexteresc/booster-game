import type { GameMap, Solid } from '../maps/parse.ts'
import { outlineOf, reach } from './outline.ts'

// A solid as the game holds it: a spinning one carries the angle it has turned by about its rect's center, clockwise.
export type PlacedSolid = Solid & { angle?: number }
type Surface = { y: number; slope: number }

// Outside the map counts as solid. y = -Infinity makes a foot "sink" infinitely
// deep, so touching the map edge is always a crash.
const OUT_OF_BOUNDS: Solid = { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity }

export function solidAt(map: GameMap, x: number, y: number): PlacedSolid | null {
  if (x < 0 || y < 0 || x > map.width || y > map.height) return OUT_OF_BOUNDS
  return map.solids.find((s) => inside(s, x, y)) ?? null
}

function inside(solid: PlacedSolid, x: number, y: number) {
  if (!solid.angle) return insideUpright(solid, x, y)
  const cx = solid.x + solid.w / 2
  const cy = solid.y + solid.h / 2
  const [dx, dy] = rotate(x - cx, y - cy, -solid.angle)
  return insideUpright(solid, cx + dx, cy + dy)
}

function insideUpright({ x: left, y: top, w, h, shape }: Solid, x: number, y: number) {
  if (x < left || x > left + w || y < top || y > top + h) return false
  return !shape || reach(outlineOf(shape, w, h), x - left, y - top) <= 1
}

// The edge at x a rocket stands on (side -1, the top) or a cannon hangs from (side 1, the underside): its
// height and steepness as rise over run (1 = 45°). Nothing stands on or hangs from the sea or a spinning solid.
export function surfaceAt(solid: Solid, x: number, side: -1 | 1): Surface | null {
  if (solid.kind === 'water' || solid.spin) return null
  if (!solid.shape) return { y: side < 0 ? solid.y : solid.y + solid.h, slope: 0 }
  const edge = edgeAt(outlineOf(solid.shape, solid.w, solid.h).points, x - solid.x, side)
  return { y: solid.y + edge.y, slope: edge.slope }
}

// The polygon edge crossing px that is furthest up (side -1) or down (side 1).
function edgeAt(points: [number, number][], px: number, side: -1 | 1): Surface {
  let y = -side * Infinity
  let slope = Infinity
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    if (px < x0 === px < x1) continue
    const at = y0 + ((px - x0) / (x1 - x0)) * (y1 - y0)
    if ((at - y) * side > 0) [y, slope] = [at, Math.abs((y1 - y0) / (x1 - x0))]
  }
  return { y, slope }
}

// Clockwise with y pointing down, as the canvas turns things.
export function rotate(x: number, y: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}

export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
