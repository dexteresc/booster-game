import { COLOR } from './theme.ts'
import { outlineOf } from '../sim/outline.ts'
import type { Rect, Shape } from '../maps/parse.ts'
import type { PlacedSolid } from '../sim/geometry.ts'

// Round and lumpy solids of any material but rock: the art clipped to the outline, then shaded as a ball.

const BALL = [[0, 'rgba(255,248,235,0.22)'], [0.35, 'rgba(255,248,235,0)'], [0.7, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0.7)']] as const // lit → shade

// Any material in a round or lumpy outline, turned as far as it has spun: its art clipped to it, then shaded
// upright as a ball lit from the upper left, so the light stays put as it turns. Round ones get a lit rim.
export function drawShaped(ctx: CanvasRenderingContext2D, solid: PlacedSolid, shape: Shape, draw: () => void) {
  const rx = solid.w / 2
  const ry = solid.h / 2
  const cx = solid.x + rx
  const cy = solid.y + ry
  ctx.save()
  const upright = ctx.getTransform()
  ctx.translate(cx, cy)
  ctx.rotate(solid.angle ?? 0)
  ctx.translate(-cx, -cy)
  ctx.clip(outlinePath({ ...solid, shape }))
  draw()
  ctx.setTransform(upright)
  const reach = Math.max(rx, ry) * 1.5
  const light = ctx.createRadialGradient(cx - rx * 0.4, cy - ry * 0.45, 0, cx - rx * 0.25, cy - ry * 0.3, reach)
  for (const [at, color] of BALL) light.addColorStop(at, color)
  ctx.fillStyle = light
  ctx.fillRect(cx - reach, cy - reach, reach * 2, reach * 2)
  ctx.restore()
  if (shape !== 'round') return
  ctx.strokeStyle = COLOR.lip
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx - 0.75, ry - 0.75, 0, 1.05 * Math.PI, 1.6 * Math.PI)
  ctx.stroke()
}

// Upright, in world units: the rect, or the round or lumpy outline inside it.
export function outlinePath({ x: left, y: top, w, h, shape }: Rect & { shape?: Shape }) {
  const path = new Path2D()
  if (!shape) {
    path.rect(left, top, w, h)
    return path
  }
  for (const [x, y] of outlineOf(shape, w, h).points) path.lineTo(left + x, top + y)
  path.closePath()
  return path
}
