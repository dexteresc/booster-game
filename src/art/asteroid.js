import { outlineOf, reach } from '../sim/outline.js'
import { rotate } from '../sim/geometry.js'
import { TAU, clamp, hash, onScreen, turnedAbout } from './brush.js'

// Asteroids lit per pixel from a baked height field (a dome over the outline, craters, noise). A spinning
// rock keeps its baked surface and is relit as it turns, so its craters turn but the sun stays put.

const KEY = norm([-0.55, -0.65, 0.55]) // toward the sun
const RIM = norm([0.75, 0.55, 0.15]) // nebula bounce light
const KEY_COLOR = [1.08, 1, 0.9]
const RIM_COLOR = [0.35, 0.55, 1]
const AMBIENT = [0.1, 0.09, 0.15]
const MAX_PIXELS = 700_000 // bake budget per rock; big rocks bake a little softer
const MAX_RES = 1.5 // baked pixels per world unit
const RELIGHT_STEP = 0.03 // radians a spinning rock turns between relights; finer steps don't show
const CACHE_SIZE = 48
const baked = new Map() // least recently used first
const spinners = new WeakMap() // solid → its own surface and canvas, relit in place

// s.angle left out = not spinning.
export function drawLitAsteroid(ctx, s, { body }) {
  if (s.angle === undefined) ctx.drawImage(bakedFor(s, body), s.x, s.y, s.w, s.h)
  else drawSpinner(ctx, s, body)
}

export function bakeAsteroid(w, h, body, shape = 'lumpy') {
  const surface = surfaceOf(w, h, body, shape)
  const { canvas, ctx, img } = blank(surface)
  relight(img.data, surface, KEY, RIM)
  ctx.putImageData(img, 0, 0)
  return canvas
}

function bakedFor(s, body) {
  const key = `${s.w}x${s.h} ${s.shape} ${body}`
  const canvas = baked.get(key) ?? bakeAsteroid(s.w, s.h, body, s.shape)
  baked.delete(key)
  baked.set(key, canvas)
  if (baked.size > CACHE_SIZE) baked.delete(baked.keys().next().value)
  return canvas
}

function drawSpinner(ctx, s, body) {
  const r = Math.hypot(s.w, s.h) / 2
  if (!onScreen(ctx, { x: s.x + s.w / 2 - r, y: s.y + s.h / 2 - r, w: r * 2, h: r * 2 })) return
  let spin = spinners.get(s)
  if (!spin) {
    const surface = surfaceOf(s.w, s.h, body, s.shape)
    spin = { surface, ...blank(surface), angle: Infinity }
    spinners.set(s, spin)
  }
  if (Math.abs(s.angle - spin.angle) >= RELIGHT_STEP) {
    relight(spin.img.data, spin.surface, turned(KEY, s.angle), turned(RIM, s.angle))
    spin.ctx.putImageData(spin.img, 0, 0)
    spin.angle = s.angle
  }
  turnedAbout(ctx, s, s.angle, () => ctx.drawImage(spin.canvas, s.x, s.y, s.w, s.h))
}

// A light fixed in the world, as the rock sees it once it has turned by angle.
function turned([x, y, z], angle) {
  return [...rotate(x, y, -angle), z]
}

function blank({ W, H }) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  return { canvas, ctx, img: ctx.createImageData(W, H) }
}

// Everything about the rock that doesn't depend on the light: per pixel normal, colour, crater
// occlusion and outline coverage. Lengths in baked pixels.
function surfaceOf(w, h, body, shape) {
  const res = Math.min(MAX_RES, Math.sqrt(MAX_PIXELS / (w * h)))
  const W = Math.max(2, Math.round(w * res))
  const H = Math.max(2, Math.round(h * res))
  const outline = outlineOf(shape, w, h)
  const rock = { W, H, kx: W / w, ky: H / h, outline, seed: (w * 7919 + h * 104729) % 9973 }
  rock.depth = Math.min(outline.sx * rock.kx, outline.sy * rock.ky)
  rock.reaches = reachField(rock)
  rock.craters = scatterCraters(rock)
  return { W, H, ...surfaceFields(rock, heightField(rock), body.map(hex)) }
}

function reachField({ W, H, kx, ky, outline }) {
  const field = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) field[y * W + x] = reach(outline, (x + 0.5) / kx, (y + 0.5) / ky)
  return field
}

// Craters of every size, mostly small, kept off the very edge where they'd look like bites.
function scatterCraters({ outline: { cx, cy, sx, sy, radius }, kx, ky, seed, depth }) {
  const count = Math.round(Math.min(45, (sx * kx * sy * ky) / 1300))
  return Array.from({ length: count }, (_, i) => {
    const a = hash(seed, i, 1) * TAU
    const d = Math.sqrt(hash(seed, i, 2)) * 0.8 * radius(a)
    return { x: (cx + Math.cos(a) * d * sx) * kx, y: (cy + Math.sin(a) * d * sy) * ky, r: 2 + hash(seed, i, 3) ** 2.5 * depth * 0.28 }
  })
}

// Height in pixels above the rock's silhouette plane; NaN outside the rock.
function heightField(rock) {
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

function dome(depth, t) {
  return depth * Math.sqrt(Math.max(0, 1 - t * t))
}

// Bowl with a raised rim that fades into the ground around it.
function craterDepth(craters, x, y) {
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

function bumps(x, y, seed, depth) {
  return depth * 0.045 * fbm(x / 38, y / 38, seed) + 2.2 * fbm(x / 7, y / 7, seed + 17)
}

function surfaceFields(rock, field, [top, mid, base]) {
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
      albedo.set(mottle([top, mid, base], fbm(x / 60, y / 60, seed + 5), hash(seed, x * 7 + y * 13, 9)), i * 3)
      cavity[i] = clamp((dome(depth, reaches[i]) - field[i]) / 6, 0, 1) // crater floors get less sky
      alpha[i] = 255 * clamp((1 - reaches[i]) * depth + 0.5, 0, 1) // antialiased outline
    }
  }
  return { normal, albedo, cavity, alpha }
}

// key, rim: directions toward the two lights, in the rock's own frame.
function relight(data, { normal, albedo, cavity, alpha }, key, rim) {
  for (let i = 0, n = 0; i < alpha.length; i++, n += 3) {
    data[i * 4 + 3] = alpha[i]
    if (!alpha[i]) continue
    const [nx, ny, nz] = [normal[n], normal[n + 1], normal[n + 2]]
    const lit = Math.max(0, nx * key[0] + ny * key[1] + nz * key[2]) * (1 - cavity[i] * 0.5) * 1.25
    const edge = Math.max(0, nx * rim[0] + ny * rim[1] + nz * rim[2]) * (1 - nz) ** 1.5 * 1.6 * 90
    const sky = (0.55 + 0.45 * nz) * (1 - cavity[i] * 0.6)
    for (let c = 0; c < 3; c++) data[i * 4 + c] = albedo[n + c] * (KEY_COLOR[c] * lit + AMBIENT[c] * sky) + RIM_COLOR[c] * edge
  }
}

function normalAt(field, { W, H }, x, y) {
  const at = (px, py) => {
    const value = field[Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))]
    return Number.isNaN(value) ? field[y * W + x] - 3 : value // past the edge the surface falls away
  }
  return norm([(at(x - 1, y) - at(x + 1, y)) / 2, (at(x, y - 1) - at(x, y + 1)) / 2, 1])
}

// Patchy colour between the three rock tones, with fine grain on top.
function mottle([top, mid, base], patch, grain) {
  const t = clamp(0.5 + patch * 0.9, 0, 1)
  const [a, b, k] = t > 0.5 ? [mid, top, (t - 0.5) * 2] : [base, mid, t * 2]
  const g = 0.9 + grain * 0.2
  return [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * k) * g)
}

// Value noise, roughly -1..1, three octaves.
function fbm(x, y, seed) {
  let sum = 0
  for (let o = 0, f = 1; o < 3; o++, f *= 2.03) sum += valueNoise(x * f, y * f, seed + o * 31) / 2 ** (o + 1)
  return sum * 1.6
}

function valueNoise(x, y, seed) {
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

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function hex(color) {
  const n = parseInt(color.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function norm([x, y, z]) {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}
