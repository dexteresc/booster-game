import { COLOR, RAIN } from './theme.js'
import { TAU, additive, rand } from './brush.js'

// The sea: a wavy mirror of what's drawn above it, tinted, with ripples and sun glints.

// rect: a solid tagged `water`. solids: the map's, for foam where rock meets the sea.
export function layoutSea(rect, solids, rain) {
  return {
    rect,
    ripples: Array.from({ length: Math.round(rect.w / 10) }, () => ({
      x: rand(rect.x, rect.x + rect.w),
      depth: rand(2, rect.h),
      len: rand(6, 30),
      phase: rand(0, TAU),
    })),
    glints: Array.from({ length: 60 }, () => ({
      dx: (rand(0, 1) + rand(0, 1) + rand(0, 1) - 1.5) * 120,
      depth: rand(1, rect.h * 0.7),
      len: rand(4, 16),
      phase: rand(0, TAU),
    })),
    splashes: rain
      ? Array.from({ length: Math.round(rect.w / 25) }, () => ({ x: rand(rect.x, rect.x + rect.w), speed: rand(0.8, 1.6), phase: rand(0, 1) }))
      : [],
    shores: solids.filter((s) => !s.water && s.y + s.h === rect.y && s.x < rect.x + rect.w && s.x + s.w > rect.x),
  }
}

// look: { sky, rain, sunX, mirror } — mirror is a scratch canvas reused every frame.
export function drawSea(ctx, sea, look, clock) {
  drawReflection(ctx, sea.rect, look, clock)
  const { rect } = sea
  const tint = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h)
  tint.addColorStop(0, look.sky.water[0])
  tint.addColorStop(1, look.sky.water[1])
  ctx.fillStyle = tint
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)

  ctx.fillStyle = COLOR.ripple
  for (const r of sea.ripples) ctx.fillRect(r.x + Math.sin(clock * 1.5 + r.phase) * 6, rect.y + r.depth, r.len, 1)
  drawGlints(ctx, sea, look, clock)
  drawSplashes(ctx, sea, clock)
  drawShoreline(ctx, sea, look.sky, clock)
}

// Mirrors what's already drawn above the surface, in wavy pixel rows.
function drawReflection(ctx, rect, { rain, mirror }, clock) {
  const m = ctx.getTransform()
  const top = Math.round(rect.y * m.d + m.f)
  const bottom = Math.min(ctx.canvas.height, Math.round((rect.y + rect.h) * m.d + m.f))
  const h = Math.min(bottom - top, top)
  if (h <= 0) return

  const w = ctx.canvas.width
  if (mirror.width !== w || mirror.height !== h) {
    mirror.width = w
    mirror.height = h
  }
  mirror.getContext('2d').drawImage(ctx.canvas, 0, top - h, w, h, 0, 0, w, h)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const band = 2
  const choppy = rain ? 2.5 : 1
  for (let y = 0; y < h; y += band) {
    const depth = y / m.d // world units below the surface
    const dx = Math.sin(clock * 2 * choppy + depth * 0.25) * (0.5 + depth * 0.06) * choppy * m.a
    ctx.drawImage(mirror, 0, Math.max(0, h - y - band), w, band, dx - 8, top + y, w + 16, band)
  }
  ctx.restore()
}

function drawGlints(ctx, { rect, glints }, { sky, rain, sunX }, clock) {
  additive(ctx, () => {
    ctx.fillStyle = sky.glint
    for (const g of glints) {
      ctx.globalAlpha = Math.max(0, Math.sin(clock * 5 + g.phase)) * (rain ? 0.25 : 1)
      ctx.fillRect(sunX + g.dx * (0.4 + g.depth / rect.h), rect.y + g.depth, g.len, 1.2)
    }
    ctx.globalAlpha = 1
  })
}

function drawSplashes(ctx, { rect, splashes }, clock) {
  ctx.strokeStyle = RAIN.splash
  ctx.lineWidth = 0.8
  for (const s of splashes) {
    const t = (clock * s.speed + s.phase) % 1
    ctx.globalAlpha = 1 - t
    ctx.beginPath()
    ctx.ellipse(s.x, rect.y + 2, 1 + t * 9, 0.5 + t * 2, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawShoreline(ctx, { rect, shores }, sky, clock) {
  ctx.fillStyle = sky.waterLine
  ctx.fillRect(rect.x, rect.y, rect.w, 1)
  ctx.fillStyle = COLOR.foam
  for (const s of shores) {
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(clock * 2 + s.x)
    ctx.fillRect(s.x - 4, rect.y - 0.5, s.w + 8, 2)
  }
  ctx.globalAlpha = 1
}
