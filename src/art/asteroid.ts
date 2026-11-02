import type { Shape } from '../maps/parse.ts'
import type { PlacedSolid } from '../sim/geometry.ts'
import type { Outline } from '../sim/outline.ts'
import type { GroundColors, Palette } from './theme.ts'
import { outlineOf, reach } from '../sim/outline.ts'
import { rotate } from '../sim/geometry.ts'
import { TAU, clamp, hash, onScreen, turnedAbout } from './brush.ts'

// Asteroids lit per pixel from a baked height field (a dome over the outline, craters, noise). A spinning
// rock keeps its baked surface and is relit as it turns, so its craters turn but the sun stays put.

type Vec = [number, number, number]
type Crater = { x: number; y: number; r: number }
type Size = { W: number; H: number } // baked pixels
// Lengths in baked pixels; kx, ky: baked pixels per world unit.
type Rock = Size & {
  kx: number
  ky: number
  outline: Outline
  seed: number
  depth: number
  reaches: Float32Array // outline reach per pixel, see reach()
  craters: Crater[]
}
type Surface = Size & { normal: Float32Array; albedo: Float32Array; cavity: Float32Array; alpha: Uint8ClampedArray }
type Blank = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData }
type Spinner = Blank & { surface: Surface; angle: number }

const KEY = norm([-0.55, -0.65, 0.55]) // toward the sun
const RIM = norm([0.75, 0.55, 0.15]) // nebula bounce light
const KEY_COLOR: Vec = [1.08, 1, 0.9]
const RIM_COLOR: Vec = [0.35, 0.55, 1]
const AMBIENT: Vec = [0.1, 0.09, 0.15]
const MAX_PIXELS = 700_000 // bake budget per rock; big rocks bake a little softer
const MAX_RES = 1.5 // baked pixels per world unit
const RELIGHT_STEP = 0.03 // radians a spinning rock turns between relights; finer steps don't show
const CACHE_SIZE = 48
const baked = new Map<string, HTMLCanvasElement>() // least recently used first
const spinners = new WeakMap<PlacedSolid, Spinner>() // solid → its own surface and canvas, relit in place

// solid.angle left out = not spinning.
export function drawLitAsteroid(ctx: CanvasRenderingContext2D, solid: PlacedSolid, { body }: GroundColors) {
  if (solid.angle === undefined) ctx.drawImage(bakedFor(solid, body), solid.x, solid.y, solid.w, solid.h)
  else drawSpinner(ctx, solid, body)
}

export function bakeAsteroid(w: number, h: number, body: Palette, shape: Shape = 'lumpy') {
  const surface = surfaceOf(w, h, body, shape)
  const { canvas, ctx, img } = blank(surface)
  relight(img.data, surface, KEY, RIM)
  ctx.putImageData(img, 0, 0)
  return canvas
}

function bakedFor(solid: PlacedSolid, body: Palette) {
  const key = `${solid.w}x${solid.h} ${solid.shape} ${body}`
  const canvas = baked.get(key) ?? bakeAsteroid(solid.w, solid.h, body, solid.shape)
  baked.delete(key)
  baked.set(key, canvas)
  if (baked.size > CACHE_SIZE) baked.delete(baked.keys().next().value as string)
  return canvas
}

function drawSpinner(ctx: CanvasRenderingContext2D, solid: PlacedSolid, body: Palette) {
  const angle = solid.angle ?? 0
  const r = Math.hypot(solid.w, solid.h) / 2
  if (!onScreen(ctx, { x: solid.x + solid.w / 2 - r, y: solid.y + solid.h / 2 - r, w: r * 2, h: r * 2 })) return
  let spin = spinners.get(solid)
  if (!spin) {
    const surface = surfaceOf(solid.w, solid.h, body, solid.shape)
    spin = { surface, ...blank(surface), angle: Infinity }
    spinners.set(solid, spin)
  }
  if (Math.abs(angle - spin.angle) >= RELIGHT_STEP) {
    relight(spin.img.data, spin.surface, turned(KEY, angle), turned(RIM, angle))
    spin.ctx.putImageData(spin.img, 0, 0)
    spin.angle = angle
  }
  const { canvas } = spin
  turnedAbout(ctx, solid, angle, () => ctx.drawImage(canvas, solid.x, solid.y, solid.w, solid.h))
}

// A light fixed in the world, as the rock sees it once it has turned by angle.
function turned([x, y, z]: Vec, angle: number): Vec {
  return [...rotate(x, y, -angle), z]
}

function blank({ W, H }: Size): Blank {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  return { canvas, ctx, img: ctx.createImageData(W, H) }
}

// Everything about the rock that doesn't depend on the light: per pixel normal, colour, crater
// occlusion and outline coverage.
function surfaceOf(w: number, h: number, body: Palette, shape: Shape = 'lumpy'): Surface {
  const res = Math.min(MAX_RES, Math.sqrt(MAX_PIXELS / (w * h)))
  const W = Math.max(2, Math.round(w * res))
  const H = Math.max(2, Math.round(h * res))
  const outline = outlineOf(shape, w, h)
  const kx = W / w
  const ky = H / h
  const seed = (w * 7919 + h * 104729) % 9973
  const depth = Math.min(outline.sx * kx, outline.sy * ky)
  const reaches = reachField({ W, H, kx, ky, outline })
  const rock: Rock = { W, H, kx, ky, outline, seed, depth, reaches, craters: [] }
  rock.craters = scatterCraters(rock)
  return { W, H, ...surfaceFields(rock, heightField(rock), body.map(hex)) }
}

function reachField({ W, H, kx, ky, outline }: Pick<Rock, 'W' | 'H' | 'kx' | 'ky' | 'outline'>) {
  const field = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) field[y * W + x] = reach(outline, (x + 0.5) / kx, (y + 0.5) / ky)
  }
  return field
}

// Craters of every size, mostly small, kept off the very edge where they'd look like bites.
function scatterCraters({ outline: { cx, cy, sx, sy, radius }, kx, ky, seed, depth }: Rock): Crater[] {
  const count = Math.round(Math.min(45, (sx * kx * sy * ky) / 1300))
  return Array.from({ length: count }, (_, i) => {
    const a = hash(seed, i, 1) * TAU
    const d = Math.sqrt(hash(seed, i, 2)) * 0.8 * radius(a)
    const r = 2 + hash(seed, i, 3) ** 2.5 * depth * 0.28
    return { x: (cx + Math.cos(a) * d * sx) * kx, y: (cy + Math.sin(a) * d * sy) * ky, r }
  })
}

// Height in pixels above the rock's silhouette plane; NaN outside the rock.
function heightField(rock: Rock) {
  const { W, H, seed, depth, reaches } = rock
  const field = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = reaches[y * W + x]
      field[y * W + x] = t > 1 ? NaN : dome(depth, t) + bumps(x, y, seed, depth) + craterDepth(rock.craters, x, y)
    }
  }
  return field
}

function dome(depth: number, reachAt: number) {
  return depth * Math.sqrt(Math.max(0, 1 - reachAt * reachAt))
}

// Bowl with a raised rim that fades into the ground around it.
function craterDepth(craters: Crater[], x: number, y: number) {
  let total = 0
  for (const c of craters) {
    const dx = x - c.x
    const dy = y - c.y
    if (Math.abs(dx) > c.r * 1.6 || Math.abs(dy) > c.r * 1.6) continue
    const d = Math.sqrt(dx * dx + dy * dy) / c.r
    if (d < 1) total -= c.r * 0.45 * (1 - d * d)
    total += c.r * 0.12 * Math.exp(-(((d - 1) / 0.28) ** 2))
  }
  return total
}

function bumps(x: number, y: number, seed: number, depth: number) {
  return depth * 0.045 * fbm(x / 38, y / 38, seed) + 2.2 * fbm(x / 7, y / 7, seed + 17)
}

function surfaceFields(rock: Rock, field: Float32Array, tones: Vec[]) {
  const { W, H, seed, depth, reaches } = rock
  const normal = new Float32Array(W * H * 3)
  const albedo = new Float32Array(W * H * 3)
  const cavity = new Float32Array(W * H)
  const alpha = new Uint8ClampedArray(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (Number.isNaN(field[i])) continue
      normal.set(normalAt(field, rock, x, y), i * 3)
      albedo.set(mottle(tones, fbm(x / 60, y / 60, seed + 5), hash(seed, x * 7 + y * 13, 9)), i * 3)
      cavity[i] = clamp((dome(depth, reaches[i]) - field[i]) / 6, 0, 1) // crater floors get less sky
      alpha[i] = 255 * clamp((1 - reaches[i]) * depth + 0.5, 0, 1) // antialiased outline
    }
  }
  return { normal, albedo, cavity, alpha }
}

// key, rim: directions toward the two lights, in the rock's own frame.
function relight(data: Uint8ClampedArray, { normal, albedo, cavity, alpha }: Surface, key: Vec, rim: Vec) {
  for (let i = 0, n = 0; i < alpha.length; i++, n += 3) {
    data[i * 4 + 3] = alpha[i]
    if (!alpha[i]) continue
    const [nx, ny, nz] = [normal[n], normal[n + 1], normal[n + 2]]
    const lit = Math.max(0, nx * key[0] + ny * key[1] + nz * key[2]) * (1 - cavity[i] * 0.5) * 1.25
    const edge = Math.max(0, nx * rim[0] + ny * rim[1] + nz * rim[2]) * (1 - nz) ** 1.5 * 1.6 * 90
    const sky = (0.55 + 0.45 * nz) * (1 - cavity[i] * 0.6)
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = albedo[n + c] * (KEY_COLOR[c] * lit + AMBIENT[c] * sky) + RIM_COLOR[c] * edge
    }
  }
}

function normalAt(field: Float32Array, { W, H }: Rock, x: number, y: number) {
  const at = (px: number, py: number) => {
    const value = field[Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))]
    return Number.isNaN(value) ? field[y * W + x] - 3 : value // past the edge the surface falls away
  }
  return norm([(at(x - 1, y) - at(x + 1, y)) / 2, (at(x, y - 1) - at(x, y + 1)) / 2, 1])
}

// Patchy colour between the three rock tones, with fine grain on top.
function mottle([top, mid, base]: Vec[], patch: number, grain: number) {
  const t = clamp(0.5 + patch * 0.9, 0, 1)
  const [from, to, k] = t > 0.5 ? [mid, top, (t - 0.5) * 2] : [base, mid, t * 2]
  const g = 0.9 + grain * 0.2
  return [0, 1, 2].map((c) => (from[c] + (to[c] - from[c]) * k) * g)
}

// Value noise, roughly -1..1, three octaves.
function fbm(x: number, y: number, seed: number) {
  let sum = 0
  for (let o = 0, f = 1; o < 3; o++, f *= 2.03) sum += valueNoise(x * f, y * f, seed + o * 31) / 2 ** (o + 1)
  return sum * 1.6
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const c00 = hash(seed, x0, y0)
  const c10 = hash(seed, x0 + 1, y0)
  const c01 = hash(seed, x0, y0 + 1)
  const c11 = hash(seed, x0 + 1, y0 + 1)
  const top = c00 + (c10 - c00) * fx
  const bottom = c01 + (c11 - c01) * fx
  return (top + (bottom - top) * fy) * 2 - 1
}

function smooth(fraction: number) {
  return fraction * fraction * (3 - 2 * fraction)
}

function hex(color: string): Vec {
  const n = parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function norm([x, y, z]: Vec): Vec {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}
