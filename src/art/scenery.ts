import { FLAG_HEIGHT } from '../sim/game.ts'
import { BIOMES, COLOR, RAIN, SKIES, TEAM } from './theme.ts'
import { TAU, additive, chrome, glowDot, rand } from './brush.ts'
import { drawSea, layoutSea } from './sea.ts'
import { drawHills, layoutHills } from './hills.ts'
import { bakeNebula, drawNebula, drawPlanet } from './space.ts'
import type { Point } from './brush.ts'
import type { Sky, Time } from './theme.ts'
import type { Biome, GameMap, Rect, Team } from '../maps/parse.ts'

// Things that stay put: sky, weather, distant hills, sea, landing pads, flags.
// Solids are in solids.ts, props in props/, hills in hills.ts.

// Parallax k: 0 = pinned to the screen, 1 = moves with the world.
const SKY_LAYER = 0.1 // stars, suns
const CLOUD_LAYER = 0.15 // clouds, passing ships
const STAR_DEPTH = 0.6 // share of the sky with stars, fading out toward the bottom
const PIN_RADIUS = 26 // objective pointer's circle, outer edge
const PIN_BORDER = 3 // outer white
const PIN_FRAME = 5 // black ring inside it
const PIN_POINT = 1.73 // the tip's distance from the center, in radii

type Weather = { time: Time; rain: boolean }
export type Scenery = ReturnType<typeof createScenery>
type Scene = ReturnType<typeof layoutScene>
type Lightning = { next: number; at: number } // when the next bolt strikes, when the last one did

// Times of day and rain odds depend on the biome.
export function randomWeather(biome: Biome): Weather {
  if (!BIOMES[biome]) throw new Error(`randomWeather: unknown biome "${biome}", expected one of ${Object.keys(BIOMES)}`)
  const times = BIOMES[biome].skies
  return { time: times[Math.floor(Math.random() * times.length)], rain: Math.random() < BIOMES[biome].rain }
}

// Random layout is generated once per map.
// Solids tagged `water` are drawn as sea; draw everything else first, then water().
export function createScenery(map: GameMap, weather: Weather) {
  const sky = SKIES[weather.time]
  if (!sky) throw new Error(`createScenery: unknown time "${weather.time}", expected one of ${Object.keys(SKIES)}`)
  const scene = layoutScene(map, sky, weather.rain)
  const seas = map.solids.filter((s) => s.kind === 'water').map((rect) => layoutSea(rect, map.solids, weather.rain))
  const mirror = document.createElement('canvas')
  const lightning: Lightning = { next: rand(3, 8), at: -Infinity }

  return {
    weather,
    sky,

    // cx, cy: camera center in world units.
    backdrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, clock: number) {
      drawBackdrop(ctx, scene, { x: cx - map.width / 2, y: cy - map.height / 2 }, clock)
    },

    water(ctx: CanvasRenderingContext2D, cx: number, clock: number) {
      const sunX = sky.suns[0].x * map.width + (cx - map.width / 2) * (1 - SKY_LAYER)
      for (const sea of seas) drawSea(ctx, sea, { sky, rain: weather.rain, sunX, mirror }, clock)
    },

    // Screen space, over the whole canvas but the HUD. ox, oy: camera offset in pixels, so rain drifts past.
    rain(ctx: CanvasRenderingContext2D, ox: number, oy: number, clock: number) {
      if (!weather.rain) return
      drawRain(ctx, scene.drops, { x: ox, y: oy }, clock)
      drawLightning(ctx, lightning, clock)
    },
  }
}

function layoutScene(map: GameMap, sky: Sky, rain: boolean) {
  const { width, height } = map
  const starDepth = sky.starDepth ?? STAR_DEPTH
  return {
    map,
    sky,
    rain,
    starDepth,
    stars: Array.from({ length: Math.round(300 * starDepth) }, () => ({
      x: rand(-500, width + 500),
      y: rand(0, height * starDepth),
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
    nebula: sky.nebula ? bakeNebula(map, sky.nebula) : null,
    hills: layoutHills(map, sky, map.biome),
    drops: rain
      ? Array.from({ length: 260 }, (_, i) => ({
          x: rand(0, 1),
          y: rand(0, 1),
          speed: rand(0.9, 1.4),
          near: i % 3 === 0,
        }))
      : [],
  }
}

// offset: camera center minus map center, world units.
function drawBackdrop(ctx: CanvasRenderingContext2D, scene: Scene, offset: Point, clock: number) {
  const { map, sky, rain } = scene
  const g = ctx.createLinearGradient(0, 0, 0, map.height)
  for (const [at, color] of sky.sky) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, map.width, map.height)

  parallax(ctx, SKY_LAYER, offset, () => {
    drawNebula(ctx, scene.nebula, map)
    if (sky.stars && !rain) drawStars(ctx, scene, clock)
    drawSuns(ctx, sky, map)
    for (const planet of sky.planets ?? []) drawPlanet(ctx, planet, sky, map)
  })
  if (rain) {
    ctx.fillStyle = sky.overcast
    ctx.fillRect(0, 0, map.width, map.height)
  }
  parallax(ctx, CLOUD_LAYER, offset, () => {
    drawClouds(ctx, scene)
    drawShips(ctx, scene, clock)
  })
  for (const m of scene.hills) parallax(ctx, m.k, offset, () => drawHills(ctx, m, scene, clock))
}

function parallax(ctx: CanvasRenderingContext2D, k: number, offset: Point, draw: () => void) {
  ctx.save()
  ctx.translate(offset.x * (1 - k), offset.y * (1 - k))
  draw()
  ctx.restore()
}

function drawStars(ctx: CanvasRenderingContext2D, { stars, sky, map, starDepth }: Scene, clock: number) {
  ctx.fillStyle = COLOR.star
  for (const s of stars) {
    const fade = 1 - s.y / (map.height * starDepth * 1.1)
    ctx.globalAlpha = sky.stars * fade * (0.65 + 0.35 * Math.sin(clock * 2 + s.phase))
    ctx.fillRect(s.x, s.y, s.size, s.size)
  }
  ctx.globalAlpha = 1
}

function drawSuns(ctx: CanvasRenderingContext2D, sky: Sky, { width, height }: Pick<GameMap, 'width' | 'height'>) {
  additive(ctx, () => {
    for (const s of sky.suns) {
      glowDot(ctx, s.x * width, s.y * height, { radius: s.r * 7, color: sky.sunGlow, alpha: sky.glow })
    }
  })
  ctx.fillStyle = sky.sun
  for (const s of sky.suns) {
    ctx.beginPath()
    ctx.arc(s.x * width, s.y * height, s.r, 0, TAU)
    ctx.fill()
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, { clouds, sky, rain }: Scene) {
  const colors = rain ? sky.rainCloud : sky.cloud
  if (!colors) return
  const [top, bottom] = colors
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

function drawShips(ctx: CanvasRenderingContext2D, { ships, map }: Scene, clock: number) {
  const span = map.width + 1000
  additive(ctx, () => {
    for (const s of ships) {
      const x = ((((s.offset + clock * s.speed) % span) + span) % span) - 500
      glowDot(ctx, x, s.y, { radius: 4, color: COLOR.shipLight, alpha: 0.8 })
      if (Math.sin(clock * 3 + s.phase) > 0.9) glowDot(ctx, x + 3, s.y, { radius: 10, color: COLOR.shipLight })
    }
  })
}

// Sized to the canvas; call with an identity transform. offset: camera, in pixels.
function drawRain(ctx: CanvasRenderingContext2D, drops: Scene['drops'], offset: Point, clock: number) {
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

function drawLightning(ctx: CanvasRenderingContext2D, lightning: Lightning, clock: number) {
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

// Fills the whole pad rect (it's a solid too).
export function drawPad(ctx: CanvasRenderingContext2D, pad: Rect, team: Team, clock: number) {
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

function drawHazardStripes(ctx: CanvasRenderingContext2D, { x, y, w }: Rect, accent: string) {
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
function drawLampPosts(ctx: CanvasRenderingContext2D, { x, y, w }: Rect, accent: string, clock: number) {
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

export function drawFlag(ctx: CanvasRenderingContext2D, foot: Point, team: Team, clock: number) {
  const { x, y } = foot
  const { accent } = TEAM[team]
  const top = y - FLAG_HEIGHT

  ctx.fillStyle = COLOR.cream
  ctx.fillRect(x - 1, top, 2, FLAG_HEIGHT)
  drawFlagCloth(ctx, { x: x + 1, y: top }, accent, clock)
  additive(ctx, () => glowDot(ctx, x, top, { radius: 8, color: accent, alpha: 0.5 + 0.5 * Math.sin(clock * 5) }))
}

// The waving part. at: where it meets the top of the pole.
function drawFlagCloth(ctx: CanvasRenderingContext2D, at: Point, color: string, clock: number) {
  const wave = (t: number) => Math.sin(clock * 6 - t * 5) * 2 * t
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(at.x, at.y)
  for (let i = 1; i <= 8; i++) ctx.lineTo(at.x + (i / 8) * 22, at.y + (i / 8) * 8 + wave(i / 8))
  for (let i = 7; i >= 0; i--) ctx.lineTo(at.x + (i / 8) * 22, at.y + 16 - (i / 8) * 8 + wave(i / 8))
  ctx.fill()
}

// HUD pointer: a flag in a white circle, framed in black, the frame drawing out into a point. Around it all, a
// white border. x, y: circle center. angle: where the point aims. The flag stays upright.
export function drawFlagPin(ctx: CanvasRenderingContext2D, pin: Point & { angle: number }, team: Team, clock: number) {
  ctx.save()
  ctx.translate(pin.x, pin.y)
  fillPinShape(ctx, PIN_RADIUS, pin.angle, COLOR.pin)
  fillPinShape(ctx, PIN_RADIUS - PIN_BORDER, pin.angle, COLOR.pinFrame)
  ctx.fillStyle = COLOR.pin
  ctx.beginPath()
  ctx.arc(0, 0, PIN_RADIUS - PIN_BORDER - PIN_FRAME, 0, TAU)
  ctx.fill()
  ctx.scale(0.7, 0.7)
  const top = -FLAG_HEIGHT / 2
  ctx.fillStyle = COLOR.pinFrame
  ctx.fillRect(-12, top, 2, FLAG_HEIGHT)
  drawFlagCloth(ctx, { x: -10, y: top }, TEAM[team].accent, clock)
  ctx.restore()
}

// A circle at the origin with straight edges tangent to it, so the point grows out of it with no corner. Every
// size has the same proportions, which keeps a smaller one an even distance inside a bigger one all the way round.
function fillPinShape(ctx: CanvasRenderingContext2D, radius: number, angle: number, color: string) {
  const shoulder = Math.acos(1 / PIN_POINT)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, radius, angle + shoulder, angle - shoulder)
  ctx.lineTo(Math.cos(angle) * radius * PIN_POINT, Math.sin(angle) * radius * PIN_POINT)
  ctx.fill()
}
