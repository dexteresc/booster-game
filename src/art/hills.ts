import { BIOMES, COLOR } from './theme.ts'
import { TAU, additive, glowDot, rand } from './brush.ts'
import { bakeAsteroid } from './asteroid.ts'
import type { Point } from './brush.ts'
import type { HillShape, Palette, Sky } from './theme.ts'
import type { Biome, GameMap } from '../maps/parse.ts'

// Distant hills behind the map in four parallax layers, shaped by the biome:
// butte = flat-topped mesas, canopy = rounded jungle hills, island = low islands with lighthouses,
// belt = distant asteroids.
// Random layout, generated once per map by layoutHills().

// Far → near. k: parallax (0 pinned to the screen, 1 moves with the world). base: share of map
// height. size scales hill width and lights; lit = share of hills with windows.
const LAYERS = [
  { k: 0.2, base: 0.8, rise: 320, size: 0.6, lit: 0 },
  { k: 0.32, base: 0.84, rise: 260, size: 0.8, lit: 0.2 },
  { k: 0.46, base: 0.88, rise: 200, size: 1, lit: 0.4 },
  { k: 0.62, base: 0.92, rise: 150, size: 1.2, lit: 0.6 },
]
type Layer = (typeof LAYERS)[number] & { color: string }
type Beacon = Point & { phase: number; tower?: boolean }
type Skyline = { path: Path2D; windows: Point[]; beacons: Beacon[] }
type DistantRock = Point & { w: number; h: number; image: HTMLCanvasElement } // x, y: center
type RockField = { rocks: DistantRock[] } // sorted by x
type Hill = { x: number; w: number; top: number; base: number; size: number }
type HillLayer = ReturnType<typeof layoutHills>[number]

const SHAPES: Record<HillShape, (width: number, layer: Layer) => Skyline | RockField> = { butte, canopy, island, belt }

export function layoutHills(map: Pick<GameMap, 'width' | 'height'>, sky: Sky, biome: Biome) {
  const { hills: shape, tint } = BIOMES[biome] ?? {}
  if (!SHAPES[shape]) throw new Error(`layoutHills: unknown biome "${biome}", expected one of ${Object.keys(BIOMES)}`)
  return LAYERS.map((l, i) => {
    const base = map.height * l.base
    const layer = { ...l, base, lit: Math.min(1, l.lit * sky.windows), color: sky.mesas[i] }
    return { ...layer, tint, ...SHAPES[shape](map.width, layer) }
  })
}

export function drawHills(ctx: CanvasRenderingContext2D, layer: HillLayer, { sky, map }: { sky: Sky; map: Pick<GameMap, 'width'> }, clock: number) {
  if ('rocks' in layer) {
    drawRocks(ctx, layer.rocks, layer.k)
    return
  }
  ctx.fillStyle = layer.color
  ctx.fill(layer.path)
  if (layer.tint) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = layer.tint
    ctx.fill(layer.path)
    ctx.restore()
  }
  const fog = layer.rise * 0.5
  const haze = ctx.createLinearGradient(0, layer.base - fog, 0, layer.base)
  haze.addColorStop(0, sky.haze[0])
  haze.addColorStop(1, sky.haze[1])
  ctx.fillStyle = haze
  ctx.fillRect(-1500, layer.base - fog, map.width + 3000, fog)
  ctx.fillStyle = sky.haze[1]
  ctx.fillRect(-1500, layer.base, map.width + 3000, 2000)

  for (const b of layer.beacons) {
    if (b.tower) drawLighthouse(ctx, b, layer.size)
  }
  additive(ctx, () => {
    for (const w of layer.windows) {
      glowDot(ctx, w.x, w.y, { radius: 9 * layer.size, color: COLOR.windowLight, alpha: 0.35 })
      ctx.fillStyle = COLOR.windowLight
      ctx.fillRect(w.x - 1.5 * layer.size, w.y - 1.5 * layer.size, 3 * layer.size, 3 * layer.size)
    }
    for (const b of layer.beacons) {
      const alpha = Math.sin(clock * 2.5 + b.phase) > 0.6 ? 1 : 0.15
      glowDot(ctx, b.x, b.y, { radius: 16 * layer.size, color: COLOR.beacon, alpha })
    }
  })
}

function drawLighthouse(ctx: CanvasRenderingContext2D, beacon: Beacon, size: number) {
  const w = 5 * size
  const h = 26 * size
  ctx.fillStyle = COLOR.cream
  ctx.fillRect(beacon.x - w / 2, beacon.y, w, h)
  ctx.fillStyle = COLOR.signal
  for (let y = beacon.y + h * 0.2; y < beacon.y + h; y += h * 0.4) ctx.fillRect(beacon.x - w / 2, y, w, h * 0.2)
}

// Flat tops with sloped sides.
function butte(width: number, layer: Layer) {
  return skyline(width, layer, (path, { x, w, top, base, size }) => {
    const slope = rand(15, 40) * size
    path.lineTo(x + slope, top)
    path.lineTo(x + w - slope, top)
    path.lineTo(x + w, base)
  })
}

// Rounded domes, one tree crown bulging out of each.
function canopy(width: number, layer: Layer) {
  return skyline(width, { ...layer, lit: layer.lit * 0.5 }, (path, { x, w, top, base }) => {
    const peak = x + rand(0.35, 0.65) * w
    path.bezierCurveTo(x + w * 0.1, top + (base - top) * 0.3, peak - w * 0.2, top, peak, top)
    path.bezierCurveTo(peak + w * 0.2, top, x + w * 0.9, top + (base - top) * 0.3, x + w, base)
  })
}

// Long low mounds; the tallest carry a lighthouse.
function island(width: number, layer: Layer) {
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

// Far-off asteroids in a band around the layer's base, lit like the near ones but in the layer's dark
// distance colour, each a scaled copy of one of a few baked rocks. Nothing is filled below them.
function belt(width: number, { base, rise, size, color }: Layer): RockField {
  const body: Palette = [color, color, color]
  const bake = (w: number) => bakeAsteroid(w, Math.round(w * rand(0.65, 1)), body)
  const small = Array.from({ length: 7 }, () => bake(Math.round(44 * size)))
  const big = Array.from({ length: 3 }, () => bake(Math.round(132 * size)))
  const rocks = Array.from({ length: (width + 3000) / (90 * size) }, () => {
    const large = Math.random() < 0.08
    const images = large ? big : small
    const image = images[Math.floor(Math.random() * images.length)]
    const w = rand(8, 44) * size * (large ? 3 : 1)
    const x = rand(-1500, width + 1500)
    return { x, y: base - rand(-0.4, 1.8) * rise, w, h: (w * image.height) / image.width, image }
  })
  return { rocks: rocks.sort((a, b) => a.x - b.x) }
}

// Faded by distance (k: parallax), so they never read as rocks you can hit.
function drawRocks(ctx: CanvasRenderingContext2D, rocks: DistantRock[], k: number) {
  const { a, e } = ctx.getTransform()
  const left = -e / a
  const right = (ctx.canvas.width - e) / a
  ctx.globalAlpha = 0.15 + k * 0.5
  for (const rock of rocks) {
    if (rock.x + rock.w / 2 < left || rock.x - rock.w / 2 > right) continue
    ctx.drawImage(rock.image, rock.x - rock.w / 2, rock.y - rock.h / 2, rock.w, rock.h)
  }
  ctx.globalAlpha = 1
}

// Hills along the width, filled far below the base so parallax never shows a gap.
// profile(path, hill) draws the top edge from (x, base) to (x + w, base).
function skyline(width: number, { base, rise, size, lit }: Pick<Layer, 'base' | 'rise' | 'size' | 'lit'>, profile: (path: Path2D, hill: Hill) => void, stretch = 1): Skyline {
  const path = new Path2D()
  const windows: Point[] = []
  const beacons: Beacon[] = []
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

function windowsOn({ x, w, top, base, size }: Hill) {
  const at = rand(x + w * 0.3, x + w * 0.7)
  return Array.from({ length: Math.round(rand(3, 9)) }, () => ({
    x: at + rand(-0.2, 0.2) * w,
    y: rand(top + 12 * size, base - 8),
  }))
}
