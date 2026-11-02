import { COLOR, TEAM } from './theme.ts'
import { TAU, additive, glowDot, rand } from './brush.ts'
import { NOZZLE_Y } from './sprites.ts'
import { toWorld } from '../sim/rocket.ts'
import { rotate } from '../sim/geometry.ts'
import type { Point } from './brush.ts'
import type { GameEvent, ShownRocket } from '../sim/game.ts'
import type { Rocket } from '../sim/rocket.ts'

export type Explosion = Omit<Extract<GameEvent, { type: 'explode' }>, 'type'>
// Joiners don't know a rocket's velocity; its exhaust then leaves the nozzle as if it stood still.
type Exhausting = ShownRocket & Partial<Pick<Rocket, 'vx' | 'vy'>>

type MinMax = [min: number, max: number]
type Look = { gravity: number; size: number } & ({ kind: 'smoke' | 'flash' | 'puff' | 'ember' } | { kind: 'spark'; color: string })
type Particle = Look & { x: number; y: number; vx: number; vy: number; life: number; max: number }

const EXHAUST_RATE = 70 // particles per second per engine
const ADDITIVE = new Set<Particle['kind']>(['ember', 'flash', 'spark'])

// Explosions: smoke under, flash + sparks on top. Engine exhaust: embers and puffs blown out of the nozzles.
// Render-only, so Math.random is fine.
export function createEffects() {
  let particles: Particle[] = []

  return {
    explode(at: Explosion) {
      particles.push(...burst(at))
    },

    exhaust(rocket: Exhausting, engineOffset: number, dt: number) {
      for (const [side, on] of [[-1, rocket.input.left], [1, rocket.input.right]] as const) {
        if (!on) continue
        const count = Math.floor(EXHAUST_RATE * dt + Math.random())
        for (let n = 0; n < count; n++) particles.push(exhaustParticle(rocket, side * engineOffset))
      }
    },

    draw(ctx: CanvasRenderingContext2D, dt: number) {
      particles = particles.filter((p) => {
        p.life -= dt
        return p.life > 0
      })
      for (const p of particles) move(p, dt)
      const drawn = (glow: boolean) => {
        for (const p of particles) {
          if (ADDITIVE.has(p.kind) === glow) drawParticle(ctx, p, p.life / p.max) // 1 → 0
        }
      }
      drawn(false)
      additive(ctx, () => drawn(true))
    },
  }
}

function burst({ x, y, team }: Explosion) {
  const at = { x, y }
  const smoke = Array.from({ length: 12 }, () =>
    particle(at, [20, 80], [1.2, 2], { kind: 'smoke', gravity: -30, size: 6 + Math.random() * 6 }),
  )
  const flash: Particle = { x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, kind: 'flash', gravity: 0, size: 60 }
  const sparks = Array.from({ length: 40 }, (_, i) =>
    particle(at, [80, 380], [0.4, 1], {
      kind: 'spark',
      gravity: 200,
      size: 1.5 + Math.random() * 1.5,
      color: i % 4 ? COLOR.spark[i % 3] : TEAM[team].accent,
    }),
  )
  return [...smoke, flash, ...sparks]
}

// Out of the nozzle at x (rocket-local), along the rocket's down axis, on top of the rocket's own speed.
function exhaustParticle(rocket: Exhausting, x: number): Particle {
  const [px, py] = toWorld(rocket, [x, NOZZLE_Y])
  const [vx, vy] = rotate(rand(-35, 35), rand(150, 260), rocket.angle)
  const ember = Math.random() < 0.45
  const life = ember ? rand(0.15, 0.35) : rand(0.45, 0.85)
  return {
    x: px,
    y: py,
    vx: (rocket.vx ?? 0) + vx,
    vy: (rocket.vy ?? 0) + vy,
    life,
    max: life,
    kind: ember ? 'ember' : 'puff',
    gravity: 0,
    size: ember ? rand(1.2, 2.4) : rand(2.5, 4.5),
  }
}

function move(moving: Particle, dt: number) {
  moving.vy += moving.gravity * dt
  if (moving.kind === 'smoke' || moving.kind === 'puff') {
    moving.vx *= 1 - 2.5 * dt
    moving.vy *= 1 - 2.5 * dt
  }
  moving.x += moving.vx * dt
  moving.y += moving.vy * dt
}

function drawParticle(ctx: CanvasRenderingContext2D, speck: Particle, lifeLeft: number) {
  const fading = { alpha: lifeLeft }
  switch (speck.kind) {
    case 'smoke':
      disc(ctx, speck, speck.size * (2 - lifeLeft), { color: COLOR.smoke, alpha: lifeLeft * 0.45 })
      break
    case 'puff':
      disc(ctx, speck, speck.size * (3.2 - 2.2 * lifeLeft), { color: COLOR.exhaust, alpha: lifeLeft * 0.4 })
      break
    case 'ember':
      disc(ctx, speck, speck.size * (0.5 + lifeLeft * 0.5), { ...fading, color: COLOR.flame[lifeLeft > 0.5 ? 0 : 1] })
      break
    case 'flash':
      glowDot(ctx, speck.x, speck.y, { ...fading, radius: speck.size * (1.6 - lifeLeft), color: COLOR.spark[0] })
      break
    case 'spark':
      drawSpark(ctx, speck, lifeLeft)
      break
  }
}

function drawSpark(ctx: CanvasRenderingContext2D, spark: Extract<Particle, { kind: 'spark' }>, lifeLeft: number) {
  ctx.globalAlpha = lifeLeft
  ctx.strokeStyle = spark.color
  ctx.lineWidth = spark.size
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(spark.x - spark.vx * 0.03, spark.y - spark.vy * 0.03)
  ctx.lineTo(spark.x, spark.y)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function disc(
  ctx: CanvasRenderingContext2D,
  { x, y }: Point,
  radius: number,
  { color, alpha }: { color: string; alpha: number },
) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

function particle({ x, y }: Point, speed: MinMax, life: MinMax, extra: Look): Particle {
  const a = Math.random() * TAU
  const v = rand(...speed)
  const max = rand(...life)
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, ...extra }
}
