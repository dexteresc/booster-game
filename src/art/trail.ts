import { COLOR } from './theme.ts'
import { SKINS } from './skins.ts'
import { NOZZLE_Y } from './sprites.ts'
import { TAU, additive, glowDot, rand } from './brush.ts'
import type { Skin } from './skins.ts'
import type { Rocket } from '../sim/rocket.ts'

// Trails: what a rocket's engines shed besides flame, per its skin. The default is plain exhaust:
// embers and puffs blown out of the nozzles. Render-only, so Math.random is fine.
// Each engine that is on sheds RATE particles a second from its nozzle.

type SkinTrail = (typeof SKINS.trail)[keyof typeof SKINS.trail]['kind']
type TrailKind = Exclude<SkinTrail, 'exhaust'> | 'puff' | 'ember' // exhaust is puffs and embers
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
// Joiners don't know a rocket's velocity; its exhaust then leaves the nozzle as if it stood still.
type Shedding = Pick<Rocket, 'x' | 'y' | 'angle' | 'input' | 'skin'> & Partial<Pick<Rocket, 'vx' | 'vy'>>

const EMBER_SHARE = 0.45 // of exhaust particles
const PETAL_COLORS = ['#ffb7d5', '#fff0f5', '#ff8ab8', '#ffd166']
const GLITTER_COLORS = ['#ffffff', '#ffe08a', '#8af0ff', '#ff9af5']
const ASH_COLORS = ['#8a8a8a', '#5a5450', '#3a3634']
const EMBER = '#ff8a3a'

// rate: per second per engine. life: seconds. speed: px/s along the plume. scatter: radians off it.
// gravity: px/s². size: px. drag: 1/s. ride: adds the rocket's own velocity, like real exhaust.
type Look = {
  rate: number
  life: [number, number]
  speed: [number, number]
  scatter: number
  gravity: number
  size: [number, number]
  drag?: number
  ride?: boolean
}
const LOOK: Record<TrailKind, Look> = {
  puff: {
    rate: 70, life: [0.45, 0.85], speed: [150, 260], scatter: 0.15, gravity: 0, size: [2.5, 4.5], drag: 2.5, ride: true,
  },
  ember: { rate: 70, life: [0.15, 0.35], speed: [150, 260], scatter: 0.15, gravity: 0, size: [1.2, 2.4], ride: true },
  rainbow: { rate: 70, life: [0.6, 0.9], speed: [20, 50], scatter: 0.6, gravity: 0, size: [3, 5] },
  petals: { rate: 14, life: [1.4, 2.2], speed: [30, 70], scatter: 0.6, gravity: 35, size: [2, 3.2] },
  ash: { rate: 30, life: [1.5, 2.5], speed: [15, 45], scatter: 0.6, gravity: 12, size: [1, 2.4] },
  glitter: { rate: 45, life: [0.7, 1.2], speed: [30, 90], scatter: 0.6, gravity: 40, size: [0.8, 1.6] },
}

export function createTrails() {
  let particles: Particle[] = []
  let clock = 0

  return {
    // Call once per frame per alive rocket, with its drawn position.
    shed(rocket: Shedding, engineOffset: number, dt: number) {
      const trail = SKINS.trail[rocket.skin.trail].kind
      const rate = LOOK[trail === 'exhaust' ? 'puff' : trail].rate
      for (const side of [-1, 1]) {
        if (!(side < 0 ? rocket.input.left : rocket.input.right)) continue
        const count = Math.floor(rate * dt + Math.random()) // stochastic rounding keeps the rate without state
        for (let i = 0; i < count; i++) particles.push(spawn(particleKind(trail), rocket, side * engineOffset, clock))
      }
    },

    draw(ctx: CanvasRenderingContext2D, dt: number) {
      clock += dt
      particles = particles.filter((p) => {
        p.life -= dt
        return p.life > 0
      })
      for (const p of particles) {
        const { gravity, drag = 0 } = LOOK[p.kind]
        p.vy += gravity * dt
        p.vx *= 1 - drag * dt
        p.vy *= 1 - drag * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        DRAW[p.kind](ctx, p, p.life / p.max, clock)
      }
    },
  }
}

function particleKind(trail: SkinTrail): TrailKind {
  if (trail !== 'exhaust') return trail
  return Math.random() < EMBER_SHARE ? 'ember' : 'puff'
}

// At the nozzle, leaving the way the plume points plus some scatter.
function spawn(kind: TrailKind, rocket: Shedding, nozzleX: number, clock: number): Particle {
  const look = LOOK[kind]
  const cos = Math.cos(rocket.angle)
  const sin = Math.sin(rocket.angle)
  const speed = rand(...look.speed)
  const scatter = rand(-look.scatter, look.scatter)
  const max = rand(...look.life)
  const ride = look.ride ? { vx: rocket.vx ?? 0, vy: rocket.vy ?? 0 } : { vx: 0, vy: 0 }
  return {
    kind,
    x: rocket.x + nozzleX * cos - NOZZLE_Y * sin + rand(-2, 2),
    y: rocket.y + nozzleX * sin + NOZZLE_Y * cos,
    vx: ride.vx + Math.sin(rocket.angle + scatter) * -speed + rand(-15, 15),
    vy: ride.vy + Math.cos(rocket.angle + scatter) * speed,
    life: max,
    max,
    size: rand(...look.size),
    color: colorFor(kind, rocket.skin, clock),
    spin: rand(-6, 6),
  }
}

function colorFor(kind: TrailKind, skin: Skin, clock: number): string {
  if (kind === 'puff') return COLOR.exhaust
  if (kind === 'ember') return SKINS.flame[skin.flame].colors[1]
  if (kind === 'rainbow') return `hsl(${(clock * 240) % 360} 100% 65%)`
  if (kind === 'petals') return pick(PETAL_COLORS)
  if (kind === 'glitter') return pick(GLITTER_COLORS)
  return Math.random() < 0.2 ? EMBER : pick(ASH_COLORS)
}

const pick = (colors: string[]) => colors[Math.floor(Math.random() * colors.length)]

type Draw = (ctx: CanvasRenderingContext2D, particle: Particle, lifeLeft: number, clock: number) => void

const DRAW: Record<TrailKind, Draw> = {
  puff(ctx, puff, lifeLeft) {
    disc(ctx, puff, puff.size * (3.2 - 2.2 * lifeLeft), lifeLeft * 0.4)
  },
  ember(ctx, ember, lifeLeft) {
    // White-hot out of the nozzle, then the flame's color
    const glowing = { ...ember, color: lifeLeft > 0.5 ? COLOR.flame[0] : ember.color }
    additive(ctx, () => disc(ctx, glowing, ember.size * (0.5 + lifeLeft * 0.5), lifeLeft))
  },
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

function disc(ctx: CanvasRenderingContext2D, { x, y, color }: Particle, radius: number, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}
