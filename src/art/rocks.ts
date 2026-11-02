import type { Biome, Rect } from '../maps/parse.ts'
import type { PlacedSolid } from '../sim/geometry.ts'
import type { Outline } from '../sim/outline.ts'
import type { Sky } from './theme.ts'
import { outlineOf, reach, seeded } from '../sim/outline.ts'
import { rotate } from '../sim/geometry.ts'
import { GROUND_ART, groundLoads } from './ground.ts'
import { TAU, turnedAbout } from './brush.ts'
import { context2d } from '../dom.ts'

// Round and lumpy rocks, lit per pixel: a height field (a dome over the outline, broad knobs and dents,
// craters) lights the biome's own ground art. Baked once per rock; a spinning one keeps its surface and is
// relit as it turns, so its craters turn but the sun stays put.

type Vec = [number, number, number]
type Look = { sky: Sky; biome: Biome }
type Size = { W: number; H: number } // baked pixels
// Lengths in baked pixels; kx, ky: baked pixels per world unit.
type Rock = Size & { kx: number; ky: number; outline: Outline; depth: number; random: () => number }
type Bump = { x: number; y: number; r: number; span: number; profile: (d: number) => number } // d: radii out
type Fields = { normal: Float32Array; cavity: Float32Array; alpha: Uint8ClampedArray }
type Surface = Size & Fields & { albedo: Uint8ClampedArray }
type Lit = { key: string; canvas: HTMLCanvasElement; angle: number; light: ((angle: number) => void) | null }

const KEY = norm([-0.55, -0.65, 0.55]) // toward the sun
const RIM = norm([0.75, 0.55, 0.15]) // nebula bounce light
const KEY_COLOR: Vec = [1.08, 1, 0.9]
const RIM_COLOR: Vec = [0.35, 0.55, 1]
const AMBIENT: Vec = [0.1, 0.09, 0.15]
const WRAP = 0.25 // key light reaches a little past the terminator, so it rolls off instead of cutting
const MAX_PIXELS = 700_000 // bake budget per rock; big rocks bake a little softer
const MAX_RES = 1.5 // baked pixels per world unit
const RELIGHT_STEP = 0.03 // radians a spinning rock turns between relights; finer steps don't show
const ROUNDING = { samples: 256, reach: 6 } // the dome's outline: radius averaged over ±6 of 256 directions
const baked = new WeakMap<PlacedSolid, Lit>() // only a spinning rock keeps a way to relight itself

export function drawLitRock(ctx: CanvasRenderingContext2D, solid: PlacedSolid, sky: Sky, biome: Biome) {
  const rock = litFor(solid, { sky, biome })
  const angle = solid.angle ?? 0
  if (rock.light && Math.abs(angle - rock.angle) >= RELIGHT_STEP) {
    rock.light(angle)
    rock.angle = angle
  }
  turnedAbout(ctx, solid, angle, () => ctx.drawImage(rock.canvas, solid.x, solid.y, solid.w, solid.h))
}

export function bakeRock(w: number, h: number, sky: Sky, biome: Biome) {
  return bake({ x: 0, y: 0, w, h, shape: 'lumpy' }, { sky, biome }).canvas
}

// Baked again when the rock's size or colours change (the editor resizes rocks in place), or ground art loads.
function litFor(solid: PlacedSolid, look: Look): Lit {
  const key = `${solid.w}x${solid.h} ${solid.shape} ${look.biome} ${look.sky.ground[look.biome].body} ${groundLoads()}`
  const known = baked.get(solid)
  if (known?.key === key) return known
  const { canvas, light } = bake(solid, look)
  const rock = { key, canvas, angle: 0, light: solid.angle === undefined ? null : light }
  baked.set(solid, rock)
  return rock
}

// The rock lit upright, and how to light it again once it has turned by an angle.
function bake(solid: PlacedSolid, look: Look) {
  const res = Math.min(MAX_RES, Math.sqrt(MAX_PIXELS / (solid.w * solid.h)))
  const size = { W: Math.max(2, Math.round(solid.w * res)), H: Math.max(2, Math.round(solid.h * res)) }
  // The colour is read back from a CPU canvas (a GPU one would stall for it); the result lives on the GPU,
  // where it's drawn every frame.
  const albedo = albedoOf(context2d(blank(size), { willReadFrequently: true }), solid, size, look)
  const surface = { ...size, albedo, ...surfaceOf(solid, size) }
  const canvas = blank(size)
  const ctx = context2d(canvas)
  const img = ctx.createImageData(size.W, size.H)
  const light = (angle: number) => {
    relight(img.data, surface, turned(KEY, angle), turned(RIM, angle))
    ctx.putImageData(img, 0, 0)
  }
  light(0)
  return { canvas, light }
}

function blank({ W, H }: Size) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  return canvas
}

// The biome's ground art, drawn in world units so a texture lines up the way it would on a square rock.
function albedoOf(ctx: CanvasRenderingContext2D, solid: Rect, { W, H }: Size, { sky, biome }: Look) {
  const kx = W / solid.w
  const ky = H / solid.h
  ctx.setTransform(kx, 0, 0, ky, -solid.x * kx, -solid.y * ky)
  GROUND_ART[biome](ctx, solid, sky.ground[biome])
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return ctx.getImageData(0, 0, W, H).data
}

// A light fixed in the world, as the rock sees it once it has turned by angle.
function turned([x, y, z]: Vec, angle: number): Vec {
  return [...rotate(x, y, -angle), z]
}

// Everything about the rock that doesn't depend on the light: per pixel normal, crater occlusion and
// outline coverage.
function surfaceOf(solid: PlacedSolid, { W, H }: Size) {
  const outline = outlineOf(solid.shape ?? 'lumpy', solid.w, solid.h)
  const kx = W / solid.w
  const ky = H / solid.h
  const depth = Math.min(outline.sx * kx, outline.sy * ky)
  const random = seeded(Math.round(solid.w) * 7919 + Math.round(solid.h) * 104729)
  const rock: Rock = { W, H, kx, ky, outline, depth, random }
  return surfaceFields(rock, heightField(rock))
}

// Height in pixels above the rock's silhouette plane (NaN outside the rock), the same before its craters,
// and each pixel's outline reach.
function heightField(rock: Rock) {
  const { W, H, kx, ky, outline, depth } = rock
  const rounded = { ...outline, radius: rounder(outline.radius) }
  const height = new Float32Array(W * H)
  const reaches = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      reaches[i] = reach(outline, (x + 0.5) / kx, (y + 0.5) / ky)
      height[i] = reaches[i] > 1 ? NaN : dome(depth, reach(rounded, (x + 0.5) / kx, (y + 0.5) / ky))
    }
  }
  const { knobs, craters } = bumpsOn(rock)
  for (const knob of knobs) stamp(height, rock, knob)
  const body = height.slice()
  for (const pit of craters) stamp(height, rock, pit)
  return { height, body, reaches }
}

function dome(depth: number, reachAt: number) {
  return depth * Math.sqrt(Math.max(0, 1 - reachAt * reachAt))
}

// The outline's radius with its corners (where bites cut in) averaged away, so the dome has no creases.
function rounder(radius: (angle: number) => number) {
  const raw = Array.from({ length: ROUNDING.samples }, (_, i) => radius((i / ROUNDING.samples) * TAU))
  const table = raw.map((_, i) => {
    let sum = 0
    for (let k = -ROUNDING.reach; k <= ROUNDING.reach; k++) sum += raw[(i + k + raw.length) % raw.length]
    return sum / (ROUNDING.reach * 2 + 1)
  })
  return (angle: number) => {
    const t = ((((angle / TAU) % 1) + 1) % 1) * table.length
    const i = Math.floor(t)
    return table[i] + (table[(i + 1) % table.length] - table[i]) * (t - i)
  }
}

// A few broad knobs and dents for an uneven body, then craters of every size, mostly small. All kept off
// the very edge, where they'd look like bites.
function bumpsOn({ outline: { cx, cy, sx, sy, radius }, kx, ky, depth, random }: Rock) {
  const somewhere = () => {
    const a = random() * TAU
    const d = Math.sqrt(random()) * 0.8 * radius(a)
    return { x: (cx + Math.cos(a) * d * sx) * kx, y: (cy + Math.sin(a) * d * sy) * ky }
  }
  const knobs = Array.from({ length: 5 }, () => {
    const lift = depth * (random() * 0.45 - 0.15)
    const r = depth * (0.3 + random() * 0.35)
    return { ...somewhere(), r, span: 1.5, profile: (d: number) => lift * Math.max(0, 1 - (d * d) / 2.25) ** 2 }
  })
  const craters = Array.from({ length: Math.round(Math.min(45, (sx * kx * sy * ky) / 1300)) }, () => {
    const r = 2 + random() ** 3 * depth * 0.2
    return { ...somewhere(), r, span: 1.6, profile: (d: number) => crater(r, d) }
  })
  return { knobs, craters }
}

// Bowl with a raised rim that fades into the ground around it. out: distance from the center, in radii.
function crater(radius: number, out: number) {
  return radius * 0.12 * Math.exp(-(((out - 1) / 0.28) ** 2)) - (out < 1 ? radius * 0.45 * (1 - out * out) : 0)
}

function stamp(height: Float32Array, { W, H }: Size, { x: cx, y: cy, r, span, profile }: Bump) {
  for (let y = Math.max(0, Math.ceil(cy - r * span)); y <= Math.min(H - 1, cy + r * span); y++) {
    for (let x = Math.max(0, Math.ceil(cx - r * span)); x <= Math.min(W - 1, cx + r * span); x++) {
      height[y * W + x] += profile(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r)
    }
  }
}

type Heights = ReturnType<typeof heightField>

function surfaceFields({ W, H, depth }: Rock, { height, body, reaches }: Heights): Fields {
  const normal = new Float32Array(W * H * 3)
  const cavity = new Float32Array(W * H)
  const alpha = new Uint8ClampedArray(W * H)
  // Past the edge the surface falls away.
  const at = (x: number, y: number, here: number) => {
    const value = height[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]
    return Number.isNaN(value) ? here - 3 : value
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const here = height[i]
      if (Number.isNaN(here)) continue
      const nx = (at(x - 1, y, here) - at(x + 1, y, here)) / 2
      const ny = (at(x, y - 1, here) - at(x, y + 1, here)) / 2
      const l = Math.sqrt(nx * nx + ny * ny + 1)
      normal[i * 3] = nx / l
      normal[i * 3 + 1] = ny / l
      normal[i * 3 + 2] = 1 / l
      cavity[i] = unit((body[i] - here) / 6) // crater floors get less sky
      alpha[i] = 255 * unit((1 - reaches[i]) * depth + 0.5) // antialiased outline
    }
  }
  return { normal, cavity, alpha }
}

// key, rim: directions toward the two lights, in the rock's own frame.
function relight(data: Uint8ClampedArray, { albedo, normal, cavity, alpha }: Surface, key: Vec, rim: Vec) {
  for (let i = 0, n = 0; i < alpha.length; i++, n += 3) {
    data[i * 4 + 3] = alpha[i]
    if (!alpha[i]) continue
    const [nx, ny, nz] = [normal[n], normal[n + 1], normal[n + 2]]
    const facing = (nx * key[0] + ny * key[1] + nz * key[2] + WRAP) / (1 + WRAP)
    const lit = Math.max(0, facing) * (1 - cavity[i] * 0.5) * 1.25
    const edge = Math.max(0, nx * rim[0] + ny * rim[1] + nz * rim[2]) * (1 - nz) ** 1.5 * 1.6 * 90
    const sky = (0.55 + 0.45 * nz) * (1 - cavity[i] * 0.6)
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = albedo[i * 4 + c] * (KEY_COLOR[c] * lit + AMBIENT[c] * sky) + RIM_COLOR[c] * edge
    }
  }
}

function unit(value: number) {
  return Math.min(1, Math.max(0, value))
}

function norm([x, y, z]: Vec): Vec {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}
