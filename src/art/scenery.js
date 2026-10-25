import { FLAG_HEIGHT } from '../sim/game.js'
import { COLOR, RAIN, SKIES, TEAM } from './theme.js'
import { TAU, additive, chrome, glowDot, rand } from './brush.js'
import { drawSea, layoutSea } from './sea.js'

// Things that stay put: sky, weather, distant mesas, sea, rock, landing pads, flags.

// Parallax k: 0 = pinned to the screen, 1 = moves with the world.
const SKY_LAYER = 0.1 // stars, suns
const CLOUD_LAYER = 0.15 // clouds, passing ships
// Far → near. size scales butte width and lights; lit = share of buttes with windows.
const MESA_LAYERS = [
  { k: 0.2, base: 0.8, rise: 320, size: 0.6, lit: 0 },
  { k: 0.32, base: 0.84, rise: 260, size: 0.8, lit: 0.2 },
  { k: 0.46, base: 0.88, rise: 200, size: 1, lit: 0.4 },
  { k: 0.62, base: 0.92, rise: 150, size: 1.2, lit: 0.6 },
]

// weather: { time: key of SKIES, rain: boolean }
export function randomWeather() {
  const times = Object.keys(SKIES)
  return { time: times[Math.floor(Math.random() * times.length)], rain: Math.random() < RAIN.chance }
}

// Random layout is generated once per map.
// Solids tagged `water` are drawn as sea; draw everything else first, then water().
export function createScenery(map, weather) {
  const sky = SKIES[weather.time]
  if (!sky) throw new Error(`createScenery: unknown time "${weather.time}", expected one of ${Object.keys(SKIES)}`)
  const scene = layoutScene(map, sky, weather.rain)
  const seas = map.solids.filter((s) => s.water).map((rect) => layoutSea(rect, map.solids, weather.rain))
  const mirror = document.createElement('canvas')
  const lightning = { next: rand(3, 8), at: -Infinity }

  return {
    weather,
    sky,

    // cx, cy: camera center in world units.
    backdrop(ctx, cx, cy, clock) {
      drawBackdrop(ctx, scene, { x: cx - map.width / 2, y: cy - map.height / 2 }, clock)
    },

    water(ctx, cx, clock) {
      const sunX = sky.suns[0].x * map.width + (cx - map.width / 2) * (1 - SKY_LAYER)
      for (const sea of seas) drawSea(ctx, sea, { sky, rain: weather.rain, sunX, mirror }, clock)
    },

    // Screen space, over the whole canvas but the HUD. ox, oy: camera offset in pixels, so rain drifts past.
    rain(ctx, ox, oy, clock) {
      if (!weather.rain) return
      drawRain(ctx, scene.drops, { x: ox, y: oy }, clock)
      drawLightning(ctx, lightning, clock)
    },
  }
}

function layoutScene(map, sky, rain) {
  const { width, height } = map
  return {
    map,
    sky,
    rain,
    stars: Array.from({ length: 180 }, () => ({
      x: rand(-500, width + 500),
      y: rand(0, height * 0.6),
      size: rand(0.6, 2),
      phase: rand(0, TAU),
    })),
    clouds: Array.from({ length: rain ? 18 : 7 }, () => ({
      x: rand(-300, width + 300),
      y: rand(rain ? 0.1 : 0.3, 0.62) * height,
      rx: rand(250, 600),
      ry: rain ? rand(20, 60) : rand(6, 16),
    })),
    ships: Array.from({ length: 3 }, (_, i) => ({
      y: rand(0.15, 0.5) * height,
      speed: rand(15, 40) * (i % 2 ? -1 : 1),
      offset: rand(0, width),
      phase: rand(0, TAU),
    })),
    mesas: MESA_LAYERS.map((l, i) => {
      const base = height * l.base
      return { ...l, base, color: sky.mesas[i], ...skyline(width, base, { ...l, lit: Math.min(1, l.lit * sky.windows) }) }
    }),
    drops: rain
      ? Array.from({ length: 260 }, (_, i) => ({ x: rand(0, 1), y: rand(0, 1), speed: rand(0.9, 1.4), near: i % 3 === 0 }))
      : [],
  }
}

// offset: camera center minus map center, world units.
function drawBackdrop(ctx, scene, offset, clock) {
  const { map, sky, rain } = scene
  const g = ctx.createLinearGradient(0, 0, 0, map.height)
  for (const [at, color] of sky.sky) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, map.width, map.height)

  parallax(ctx, SKY_LAYER, offset, () => {
    if (sky.stars && !rain) drawStars(ctx, scene, clock)
    drawSuns(ctx, sky, map)
  })
  if (rain) {
    ctx.fillStyle = sky.overcast
    ctx.fillRect(0, 0, map.width, map.height)
  }
  parallax(ctx, CLOUD_LAYER, offset, () => {
    drawClouds(ctx, scene)
    drawShips(ctx, scene, clock)
  })
  for (const m of scene.mesas) parallax(ctx, m.k, offset, () => drawMesa(ctx, m, scene, clock))
}

function parallax(ctx, k, offset, draw) {
  ctx.save()
  ctx.translate(offset.x * (1 - k), offset.y * (1 - k))
  draw()
  ctx.restore()
}

function drawStars(ctx, { stars, sky, map }, clock) {
  ctx.fillStyle = COLOR.star
  for (const s of stars) {
    ctx.globalAlpha = sky.stars * (1 - s.y / (map.height * 0.6)) * (0.65 + 0.35 * Math.sin(clock * 2 + s.phase))
    ctx.fillRect(s.x, s.y, s.size, s.size)
  }
  ctx.globalAlpha = 1
}

function drawSuns(ctx, sky, { width, height }) {
  additive(ctx, () => {
    for (const s of sky.suns) glowDot(ctx, s.x * width, s.y * height, { radius: s.r * 7, color: sky.sunGlow, alpha: sky.glow })
  })
  ctx.fillStyle = sky.sun
  for (const s of sky.suns) {
    ctx.beginPath()
    ctx.arc(s.x * width, s.y * height, s.r, 0, TAU)
    ctx.fill()
  }
}

function drawClouds(ctx, { clouds, sky, rain }) {
  const [top, bottom] = rain ? sky.rainCloud : sky.cloud
  for (const c of clouds) {
    const cg = ctx.createLinearGradient(0, c.y - c.ry, 0, c.y + c.ry)
    cg.addColorStop(0, top)
    cg.addColorStop(1, bottom)
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU)
    ctx.fill()
  }
}

function drawShips(ctx, { ships, map }, clock) {
  const span = map.width + 1000
  additive(ctx, () => {
    for (const s of ships) {
      const x = ((((s.offset + clock * s.speed) % span) + span) % span) - 500
      glowDot(ctx, x, s.y, { radius: 4, color: COLOR.shipLight, alpha: 0.8 })
      if (Math.sin(clock * 3 + s.phase) > 0.9) glowDot(ctx, x + 3, s.y, { radius: 10, color: COLOR.shipLight })
    }
  })
}

function drawMesa(ctx, m, { sky, map }, clock) {
  ctx.fillStyle = m.color
  ctx.fill(m.path)
  const fog = m.rise * 0.5
  const haze = ctx.createLinearGradient(0, m.base - fog, 0, m.base)
  haze.addColorStop(0, sky.haze[0])
  haze.addColorStop(1, sky.haze[1])
  ctx.fillStyle = haze
  ctx.fillRect(-1500, m.base - fog, map.width + 3000, fog)
  ctx.fillStyle = sky.haze[1]
  ctx.fillRect(-1500, m.base, map.width + 3000, 2000)

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

// Flat-topped buttes; filled far below the base so parallax never shows a gap.
function skyline(width, base, { rise, size, lit }) {
  const path = new Path2D()
  const windows = []
  const beacons = []
  let x = -1500
  path.moveTo(x, base + 2000)
  path.lineTo(x, base)
  while (x < width + 1500) {
    const top = base - rand(0.45, 1) * rise
    const w = rand(120, 420) * size
    const slope = rand(15, 40) * size
    path.lineTo(x + slope, top)
    path.lineTo(x + w - slope, top)
    path.lineTo(x + w, base)
    if (Math.random() < lit) {
      const at = rand(x + w * 0.3, x + w * 0.7)
      for (let n = rand(3, 9); n > 0; n--) {
        windows.push({ x: at + rand(-0.2, 0.2) * w, y: rand(top + 12 * size, base - 8) })
      }
    }
    if (size >= 0.8 && base - top > rise * 0.75) beacons.push({ x: x + w / 2, y: top - 2, phase: rand(0, TAU) })
    x += w + rand(0, 160) * size
    path.lineTo(x, base)
  }
  path.lineTo(x, base + 2000)
  path.closePath()
  return { path, windows, beacons }
}

// Sized to the canvas; call with an identity transform. offset: camera, in pixels.
function drawRain(ctx, drops, offset, clock) {
  const { width: w, height: h } = ctx.canvas
  const len = h * 0.04
  const wind = 0.25
  ctx.strokeStyle = RAIN.drop
  ctx.lineCap = 'round'
  for (const d of drops) {
    const k = d.near ? 1 : 0.5
    const y = (((d.y * h + clock * d.speed * h - offset.y * k) % h) + h) % h
    const x = (((d.x * w - y * wind - offset.x * k) % w) + w) % w
    ctx.lineWidth = (d.near ? 1.6 : 0.8) * (h / 600)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len * wind * k, y - len * k)
    ctx.stroke()
  }
}

// lightning: { next, at } — when the next bolt strikes and when the last one did.
function drawLightning(ctx, lightning, clock) {
  if (clock > lightning.next) {
    lightning.at = clock
    lightning.next = clock + rand(5, 12)
  }
  const t = clock - lightning.at
  if (t >= 0.35) return
  ctx.globalAlpha = t < 0.08 || (t > 0.15 && t < 0.22) ? 1 : 0.3 // double flicker
  ctx.fillStyle = RAIN.lightning
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.globalAlpha = 1
}

// sky: palette from SKIES, so rock is lit to match the time of day.
export function drawRock(ctx, s, sky = SKIES.dusk) {
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h)
  g.addColorStop(0, sky.rock[0])
  g.addColorStop(Math.min(1, 20 / s.h), sky.rock[1])
  g.addColorStop(1, sky.rock[2])
  ctx.fillStyle = g
  ctx.fillRect(s.x, s.y, s.w, s.h)
  ctx.fillStyle = COLOR.strata
  for (let y = s.y + 14; y < s.y + s.h; y += 17) ctx.fillRect(s.x, y, s.w, 1.5)
  ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h)
  ctx.fillStyle = sky.rockLip
  ctx.fillRect(s.x, s.y, s.w, 3)
}

// Fills the whole pad rect (it's a solid too).
export function drawPad(ctx, pad, team, clock) {
  const { x, y, w, h } = pad
  const { accent } = TEAM[team]
  ctx.fillStyle = COLOR.metalDark
  ctx.fillRect(x + 8, y + 10, w - 16, h - 10)
  ctx.fillStyle = COLOR.creamShade
  for (let sx = x + 16; sx < x + w - 16; sx += 40) ctx.fillRect(sx, y + 10, 6, h - 10)

  const deck = ctx.createLinearGradient(0, y, 0, y + 10)
  deck.addColorStop(0, COLOR.cream)
  deck.addColorStop(1, COLOR.creamShade)
  ctx.fillStyle = deck
  ctx.fillRect(x, y, w, 10)
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, 10)

  drawHazardStripes(ctx, pad, accent)
  drawLampPosts(ctx, pad, accent, clock)
}

function drawHazardStripes(ctx, { x, y, w }, accent) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y + 4, w, 5)
  ctx.clip()
  ctx.fillStyle = accent
  for (let i = -12; i < w; i += 12) {
    ctx.beginPath()
    ctx.moveTo(x + i, y + 9)
    ctx.lineTo(x + i + 6, y + 9)
    ctx.lineTo(x + i + 11, y + 4)
    ctx.lineTo(x + i + 5, y + 4)
    ctx.fill()
  }
  ctx.restore()
}

// Googie lamp posts with ball lamps
function drawLampPosts(ctx, { x, y, w }, accent, clock) {
  const blink = Math.sin(clock * 4) > 0 ? 1 : 0.35
  for (const lx of [x + 5, x + w - 5]) {
    ctx.fillStyle = chrome(ctx, lx - 1, lx + 1)
    ctx.fillRect(lx - 1, y - 16, 2, 16)
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(lx, y - 18, 3, 0, TAU)
    ctx.fill()
  }
  additive(ctx, () => {
    for (const lx of [x + 5, x + w - 5]) glowDot(ctx, lx, y - 18, { radius: 12, color: accent, alpha: blink })
  })
}

// foot: { x, y } of the pole.
export function drawFlag(ctx, foot, team, clock) {
  const { x, y } = foot
  const { accent } = TEAM[team]
  const top = y - FLAG_HEIGHT
  const wave = (t) => Math.sin(clock * 6 - t * 5) * 2 * t

  ctx.fillStyle = COLOR.cream
  ctx.fillRect(x - 1, top, 2, FLAG_HEIGHT)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(x + 1, top)
  for (let i = 1; i <= 8; i++) ctx.lineTo(x + 1 + (i / 8) * 22, top + (i / 8) * 8 + wave(i / 8))
  for (let i = 7; i >= 0; i--) ctx.lineTo(x + 1 + (i / 8) * 22, top + 16 - (i / 8) * 8 + wave(i / 8))
  ctx.fill()
  additive(ctx, () => glowDot(ctx, x, top, { radius: 8, color: accent, alpha: 0.5 + 0.5 * Math.sin(clock * 5) }))
}
