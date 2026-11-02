import { bakeAsteroid } from './asteroid.js'
import { TAU, parallax, rand } from './brush.js'

// Things between the camera and the action, moving faster than the world (parallax k > 1):
// drifting motes, and a few out-of-focus rocks along the top and bottom edges of the map.

const MOTES = { k: 1.25, count: 220 }
const NEAR = { k: 1.7, count: 7, blur: 2, detail: 0.25 } // blurred anyway, so baked at a quarter size

export function layoutDust(map, sky) {
  if (!sky.dust) return null
  return {
    color: sky.dust,
    span: map.height + 800,
    motes: Array.from({ length: MOTES.count }, () => ({
      x: rand(-800, map.width + 800),
      y: rand(-400, map.height + 400),
      size: rand(0.8, 2.4),
      drift: rand(4, 14),
      phase: rand(0, TAU),
    })),
    rocks: Array.from({ length: NEAR.count }, (_, i) => nearRock(map, sky, i)),
  }
}

function nearRock(map, sky, i) {
  const w = Math.round(rand(160, 320))
  const h = Math.round(w * rand(0.6, 0.85))
  const top = i % 2 === 0
  const baked = bakeAsteroid(Math.round(w * NEAR.detail), Math.round(h * NEAR.detail), sky.dustRock)
  const scale = w / baked.width
  const image = blurred(baked, NEAR.blur)
  return {
    x: ((i + rand(0.2, 0.8)) / NEAR.count) * map.width * 1.4 - map.width * 0.2,
    y: top ? rand(-0.08, 0.02) * map.height : rand(0.98, 1.1) * map.height,
    w: image.width * scale,
    h: image.height * scale,
    image,
  }
}

function blurred(image, blur) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width + blur * 4
  canvas.height = image.height + blur * 4
  const ctx = canvas.getContext('2d')
  ctx.filter = `blur(${blur}px)`
  ctx.drawImage(image, blur * 2, blur * 2)
  return canvas
}

// offset: camera center minus map center, world units.
export function drawDust(ctx, dust, offset, clock) {
  if (!dust) return
  parallax(ctx, MOTES.k, offset, () => {
    ctx.fillStyle = dust.color
    for (const m of dust.motes) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(clock * 1.3 + m.phase)
      const y = ((m.y + 400 + clock * m.drift * 0.3) % dust.span) - 400
      ctx.fillRect(m.x + Math.sin(clock * 0.2 + m.phase) * m.drift, y, m.size, m.size)
    }
    ctx.globalAlpha = 1
  })
  parallax(ctx, NEAR.k, offset, () => {
    for (const r of dust.rocks) ctx.drawImage(r.image, r.x - r.w / 2, r.y - r.h / 2, r.w, r.h)
  })
}
