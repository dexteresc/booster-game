import { COLOR } from './theme.js'

// Small painting helpers shared by the art files.

export const TAU = Math.PI * 2

// Matches the backing store to the CSS size at device resolution.
export function fitCanvas(canvas) {
  const dpr = devicePixelRatio || 1
  const w = Math.round(canvas.clientWidth * dpr)
  const h = Math.round(canvas.clientHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return { dpr, w, h }
}

// Lit-from-the-left cylinder shading across x0..x1. stops = [light, mid, shadow].
export function shaded(ctx, x0, x1, [light, mid, shadow]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, mid)
  g.addColorStop(0.3, light)
  g.addColorStop(1, shadow)
  return g
}

// Polished chrome across x0..x1: hard light/dark bands.
export function chrome(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  for (const [at, color] of COLOR.chrome) g.addColorStop(at, color)
  return g
}

// Draws inside with additive blending, so overlapping light glows.
export function additive(ctx, draw) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  draw()
  ctx.restore()
}

// Art is render-only, so Math.random is fine.
export function rand(lo, hi) {
  return lo + Math.random() * (hi - lo)
}

// Soft round light. Use inside additive().
export function glowDot(ctx, x, y, { radius, color, alpha = 1 }) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = alpha
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

// Flattened dark ellipse under something standing at x, y: grounds it on the surface.
export function groundShadow(ctx, x, y, halfWidth) {
  ctx.fillStyle = COLOR.shadow
  ctx.beginPath()
  ctx.ellipse(x, y, halfWidth, halfWidth * 0.22, 0, 0, TAU)
  ctx.fill()
}
