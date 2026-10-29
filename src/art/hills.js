import { BIOMES, COLOR } from './theme.js'
import { TAU, additive, glowDot, rand } from './brush.js'

// Distant hills behind the map in four parallax layers, shaped by the biome:
// butte = flat-topped mesas, canopy = rounded jungle hills, island = low islands with lighthouses.
// Random layout, generated once per map by layoutHills().

// Far → near. k: parallax (0 pinned to the screen, 1 moves with the world). base: share of map
// height. size scales hill width and lights; lit = share of hills with windows.
const LAYERS = [
  { k: 0.2, base: 0.8, rise: 320, size: 0.6, lit: 0 },
  { k: 0.32, base: 0.84, rise: 260, size: 0.8, lit: 0.2 },
  { k: 0.46, base: 0.88, rise: 200, size: 1, lit: 0.4 },
  { k: 0.62, base: 0.92, rise: 150, size: 1.2, lit: 0.6 },
]
const SHAPES = { butte, canopy, island }

export function layoutHills(map, sky, biome) {
  const { hills: shape, tint } = BIOMES[biome] ?? {}
  if (!SHAPES[shape]) throw new Error(`layoutHills: unknown biome "${biome}", expected one of ${Object.keys(BIOMES)}`)
  return LAYERS.map((l, i) => {
    const base = map.height * l.base
    const layer = { ...l, base, lit: Math.min(1, l.lit * sky.windows) }
    return { ...layer, color: sky.mesas[i], tint, ...SHAPES[shape](map.width, layer) }
  })
}

export function drawHills(ctx, m, { sky, map }, clock) {
  ctx.fillStyle = m.color
  ctx.fill(m.path)
  if (m.tint) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = m.tint
    ctx.fill(m.path)
    ctx.restore()
  }
  const fog = m.rise * 0.5
  const haze = ctx.createLinearGradient(0, m.base - fog, 0, m.base)
  haze.addColorStop(0, sky.haze[0])
  haze.addColorStop(1, sky.haze[1])
  ctx.fillStyle = haze
  ctx.fillRect(-1500, m.base - fog, map.width + 3000, fog)
  ctx.fillStyle = sky.haze[1]
  ctx.fillRect(-1500, m.base, map.width + 3000, 2000)

  for (const b of m.beacons) if (b.tower) drawLighthouse(ctx, b, m.size)
  additive(ctx, () => {
    for (const w of m.windows) {
      glowDot(ctx, w.x, w.y, { radius: 9 * m.size, color: COLOR.windowLight, alpha: 0.35 })
      ctx.fillStyle = COLOR.windowLight
      ctx.fillRect(w.x - 1.5 * m.size, w.y - 1.5 * m.size, 3 * m.size, 3 * m.size)
    }
    for (const b of m.beacons) {
      const alpha = Math.sin(clock * 2.5 + b.phase) > 0.6 ? 1 : 0.15
      glowDot(ctx, b.x, b.y, { radius: 16 * m.size, color: COLOR.beacon, alpha })
    }
  })
}

function drawLighthouse(ctx, b, size) {
  const w = 5 * size
  const h = 26 * size
  ctx.fillStyle = COLOR.cream
  ctx.fillRect(b.x - w / 2, b.y, w, h)
  ctx.fillStyle = COLOR.signal
  for (let y = b.y + h * 0.2; y < b.y + h; y += h * 0.4) ctx.fillRect(b.x - w / 2, y, w, h * 0.2)
}

// Flat tops with sloped sides.
function butte(width, layer) {
  return skyline(width, layer, (path, { x, w, top, base, size }) => {
    const slope = rand(15, 40) * size
    path.lineTo(x + slope, top)
    path.lineTo(x + w - slope, top)
    path.lineTo(x + w, base)
  })
}

// Rounded domes, one tree crown bulging out of each.
function canopy(width, layer) {
  return skyline(width, { ...layer, lit: layer.lit * 0.5 }, (path, { x, w, top, base }) => {
    const peak = x + rand(0.35, 0.65) * w
    path.bezierCurveTo(x + w * 0.1, top + (base - top) * 0.3, peak - w * 0.2, top, peak, top)
    path.bezierCurveTo(peak + w * 0.2, top, x + w * 0.9, top + (base - top) * 0.3, x + w, base)
  })
}

// Long low mounds; the tallest carry a lighthouse.
function island(width, layer) {
  const low = { ...layer, rise: layer.rise * 0.35 }
  const hills = skyline(width, low, (path, { x, w, top, base }) => {
    path.lineTo(x + w * 0.3, top)
    path.lineTo(x + w * 0.7, base - (base - top) * 0.55)
    path.lineTo(x + w, base)
  }, 1.8)
  for (const b of hills.beacons) {
    b.tower = true
    b.y -= 26 * layer.size
  }
  return hills
}

// Hills along the width, filled far below the base so parallax never shows a gap.
// profile(path, hill) draws the top edge from (x, base) to (x + w, base).
function skyline(width, { base, rise, size, lit }, profile, stretch = 1) {
  const path = new Path2D()
  const windows = []
  const beacons = []
  let x = -1500
  path.moveTo(x, base + 2000)
  path.lineTo(x, base)
  while (x < width + 1500) {
    const top = base - rand(0.45, 1) * rise
    const w = rand(120, 420) * size * stretch
    profile(path, { x, w, top, base, size })
    if (Math.random() < lit) windows.push(...windowsOn({ x, w, top, base, size }))
    if (size >= 0.8 && base - top > rise * 0.75) beacons.push({ x: x + w / 2, y: top - 2, phase: rand(0, TAU) })
    x += w + rand(0, 160) * size
    path.lineTo(x, base)
  }
  path.lineTo(x, base + 2000)
  path.closePath()
  return { path, windows, beacons }
}

function windowsOn({ x, w, top, base, size }) {
  const at = rand(x + w * 0.3, x + w * 0.7)
  return Array.from({ length: Math.round(rand(3, 9)) }, () => ({ x: at + rand(-0.2, 0.2) * w, y: rand(top + 12 * size, base - 8) }))
}
