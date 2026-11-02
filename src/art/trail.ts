import { SKINS } from './skins.ts'
import { TAU, additive, glowDot, rand } from './brush.ts'
import type { Skin } from './skins.ts'

// Trails: what a rocket's engines shed besides flame, per its skin. Render-only, so Math.random is fine.
// Each engine that is on sheds RATE particles a second from its nozzle.

type TrailKind = Exclude<(typeof SKINS.trail)[keyof typeof SKINS.trail]['kind'], 'none'>
type Particle = {
  kind: TrailKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number // life at birth
  size: number
  color: string
  spin: number
}
type Shedding = { x: number; y: number; angle: number; input: { left: boolean; right: boolean }; skin: Skin }

const NOZZLE_Y = 18 // below the center of mass, where the plume starts
const PETAL_COLORS = ['#ffb7d5', '#fff0f5', '#ff8ab8', '#ffd166']
const GLITTER_COLORS = ['#ffffff', '#ffe08a', '#8af0ff', '#ff9af5']
const ASH_COLORS = ['#8a8a8a', '#5a5450', '#3a3634']
const EMBER = '#ff8a3a'

// per second per engine, seconds, px/s, px/s², px
type Look = { rate: number; life: [number, number]; speed: [number, number]; gravity: number; size: [number, number] }
const LOOK: Record<TrailKind, Look> = {
  rainbow: { rate: 70, life: [0.6, 0.9], speed: [20, 50], gravity: 0, size: [3, 5] },
  petals: { rate: 14, life: [1.4, 2.2], speed: [30, 70], gravity: 35, size: [2, 3.2] },
  ash: { rate: 30, life: [1.5, 2.5], speed: [15, 45], gravity: 12, size: [1, 2.4] },
  glitter: { rate: 45, life: [0.7, 1.2], speed: [30, 90], gravity: 40, size: [0.8, 1.6] },
}

export function createTrails() {
  let particles: Particle[] = []
  let clock = 0

  return {
    // Call once per frame per alive rocket, with its drawn position.
    shed(rocket: Shedding, engineOffset: number, dt: number) {
      const { kind } = SKINS.trail[rocket.skin.trail]
      if (kind === 'none') return
      const look = LOOK[kind]
      for (const side of [-1, 1]) {
        if (!(side < 0 ? rocket.input.left : rocket.input.right)) continue
        const count = Math.floor(look.rate * dt + Math.random()) // stochastic rounding keeps the rate without state
        for (let i = 0; i < count; i++) particles.push(spawn(kind, rocket, side * engineOffset, clock))
      }
    },

    draw(ctx: CanvasRenderingContext2D, dt: number) {
      clock += dt
      particles = particles.filter((p) => {
        p.life -= dt
        return p.life > 0
      })
      for (const p of particles) {
        p.vy += LOOK[p.kind].gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        DRAW[p.kind](ctx, p, p.life / p.max, clock)
      }
    },
  }
}

// At the nozzle, drifting the way the plume points plus some scatter.
function spawn(kind: TrailKind, rocket: Shedding, nozzleX: number, clock: number): Particle {
  const look = LOOK[kind]
  const cos = Math.cos(rocket.angle)
  const sin = Math.sin(rocket.angle)
  const speed = rand(...look.speed)
  const scatter = rand(-0.6, 0.6)
  const max = rand(...look.life)
  return {
    kind,
    x: rocket.x + nozzleX * cos - NOZZLE_Y * sin + rand(-2, 2),
    y: rocket.y + nozzleX * sin + NOZZLE_Y * cos,
    vx: Math.sin(rocket.angle + scatter) * -speed + rand(-15, 15),
    vy: Math.cos(rocket.angle + scatter) * speed,
    life: max,
    max,
    size: rand(...look.size),
    color: colorFor(kind, clock),
    spin: rand(-6, 6),
  }
}

function colorFor(kind: TrailKind, clock: number): string {
  if (kind === 'rainbow') return `hsl(${(clock * 240) % 360} 100% 65%)`
  if (kind === 'petals') return pick(PETAL_COLORS)
  if (kind === 'glitter') return pick(GLITTER_COLORS)
  return Math.random() < 0.2 ? EMBER : pick(ASH_COLORS)
}

const pick = (colors: string[]) => colors[Math.floor(Math.random() * colors.length)]

type Draw = (ctx: CanvasRenderingContext2D, particle: Particle, lifeLeft: number, clock: number) => void

const DRAW: Record<TrailKind, Draw> = {
  rainbow(ctx, dot, lifeLeft) {
    const radius = dot.size * (2 - lifeLeft)
    additive(ctx, () => glowDot(ctx, dot.x, dot.y, { radius, color: dot.color, alpha: lifeLeft * 0.9 }))
  },
  petals(ctx, petal, lifeLeft, clock) {
    const flutter = Math.sin(clock * 6 + petal.spin) * 0.6
    ctx.save()
    ctx.translate(petal.x + flutter * 3, petal.y)
    ctx.rotate(petal.spin * (petal.max - petal.life))
    ctx.globalAlpha = Math.min(1, lifeLeft * 2)
    ctx.fillStyle = petal.color
    ctx.beginPath()
    ctx.ellipse(0, 0, petal.size, petal.size * 0.55, 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  },
  ash(ctx, fleck, lifeLeft) {
    const ember = fleck.color === EMBER
    ctx.globalAlpha = ember ? lifeLeft : Math.min(1, lifeLeft * 1.5) * 0.8
    ctx.fillStyle = fleck.color
    ctx.fillRect(fleck.x - fleck.size / 2, fleck.y - fleck.size / 2, fleck.size, fleck.size)
    ctx.globalAlpha = 1
    if (ember) additive(ctx, () => glowDot(ctx, fleck.x, fleck.y, { radius: 4, color: EMBER, alpha: lifeLeft * 0.6 }))
  },
  glitter(ctx, sparkle, lifeLeft, clock) {
    const twinkle = 0.5 + 0.5 * Math.sin(clock * 30 + sparkle.spin * 10)
    additive(ctx, () => {
      ctx.globalAlpha = lifeLeft * twinkle
      ctx.fillStyle = sparkle.color
      ctx.fillRect(sparkle.x - sparkle.size, sparkle.y - 0.4, sparkle.size * 2, 0.8)
      ctx.fillRect(sparkle.x - 0.4, sparkle.y - sparkle.size, 0.8, sparkle.size * 2)
      ctx.globalAlpha = 1
    })
  },
}
