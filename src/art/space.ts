import { TAU, additive, glowDot, rand } from './brush.ts'
import { context2d } from '../dom.ts'
import type { Planet, Sky } from './theme.ts'
import type { GameMap } from '../maps/parse.ts'

// The deep-space sky: planets lit from the sun's side, and nebula glows behind the stars.

type Size = Pick<GameMap, 'width' | 'height'>
type Body = { x: number; y: number; r: number; tilt: number }
type Giant = Extract<Planet, { kind: 'giant' }>

const NEBULA = { margin: 600, scale: 1 / 8 } // nebula glows are soft, so they're baked small once
const RINGS = [[1.55, 6, 'rgba(230,205,170,0.55)'], [1.75, 10, 'rgba(200,170,135,0.45)'], [2.0, 5, 'rgba(240,220,190,0.3)']] as const // radius, width
const NIGHT = [[0, 'rgba(255,250,235,0.12)'], [0.45, 'rgba(0,0,8,0)'], [0.8, 'rgba(2,2,12,0.85)'], [1, 'rgba(2,2,12,0.97)']] as const // lit → dark

// kind 'giant': banded, with a storm spot and rings; 'moon': plain.
export function drawPlanet(ctx: CanvasRenderingContext2D, planet: Planet, sky: Sky, { width, height }: Size) {
  const body = { x: planet.x * width, y: planet.y * height, r: planet.r, tilt: -0.35 }
  const sun = sky.suns[0]
  const toSun = Math.atan2(sun.y * height - body.y, sun.x * width - body.x)
  if (planet.kind === 'giant') drawRing(ctx, body, 'back')
  ctx.save()
  ctx.beginPath()
  ctx.arc(body.x, body.y, planet.r, 0, TAU)
  ctx.clip()
  if (planet.kind === 'giant') {
    paintBands(ctx, planet, body)
  } else {
    ctx.fillStyle = planet.color
    ctx.fillRect(body.x - planet.r, body.y - planet.r, planet.r * 2, planet.r * 2)
  }
  nightSide(ctx, body, toSun)
  ctx.restore()
  if (planet.kind === 'giant') drawRing(ctx, body, 'front')
}

function paintBands(ctx: CanvasRenderingContext2D, planet: Giant, { x, y, r, tilt }: Body) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt * 0.4)
  const rows = planet.bands.length * 2
  const band = (r * 2) / rows
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = planet.bands[(i * 7) % planet.bands.length]
    ctx.fillRect(-r * 1.2, -r + i * band, r * 2.4, band + 1)
  }
  ctx.fillStyle = planet.spot
  ctx.beginPath()
  ctx.ellipse(r * 0.25, r * 0.3, r * 0.18, r * 0.09, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

// Lit toward the sun, falling off into a dark night side.
function nightSide(ctx: CanvasRenderingContext2D, { x, y, r }: Body, toSun: number) {
  const lx = x + Math.cos(toSun) * r * 0.55
  const ly = y + Math.sin(toSun) * r * 0.55
  const shade = ctx.createRadialGradient(lx, ly, r * 0.2, lx, ly, r * 1.7)
  for (const [at, color] of NIGHT) shade.addColorStop(at, color)
  ctx.fillStyle = shade
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

// half: 'back' is the arc behind the planet, 'front' the one crossing in front of it.
function drawRing(ctx: CanvasRenderingContext2D, { x, y, r, tilt }: Body, half: 'back' | 'front') {
  const [from, to] = half === 'back' ? [Math.PI, TAU] : [0, Math.PI]
  for (const [scale, width, color] of RINGS) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(x, y, r * scale, r * scale * 0.28, tilt, from, to)
    ctx.stroke()
  }
}

export function bakeNebula({ width, height }: Size, colors: readonly string[]) {
  const { margin, scale } = NEBULA
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((width + margin * 2) * scale)
  canvas.height = Math.ceil((height + margin * 2) * scale)
  const ctx = context2d(canvas)
  ctx.scale(scale, scale)
  ctx.translate(margin, margin)
  additive(ctx, () => {
    for (const color of colors) {
      for (let i = 0; i < 5; i++) {
        glowDot(ctx, rand(0, width), rand(0.05, 0.7) * height, { radius: rand(200, 520), color, alpha: 0.35 })
      }
    }
  })
  return canvas
}

export function drawNebula(ctx: CanvasRenderingContext2D, nebula: HTMLCanvasElement | null, { width, height }: Size) {
  if (!nebula) return
  const { margin } = NEBULA
  additive(ctx, () => ctx.drawImage(nebula, -margin, -margin, width + margin * 2, height + margin * 2))
}
