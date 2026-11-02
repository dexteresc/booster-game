import { COLOR, TEAM } from './theme.js'
import { TAU, additive, glowDot, rand } from './brush.js'
import { NOZZLE_Y } from './sprites.js'
import { toWorld } from '../sim/rocket.js'
import { rotate } from '../sim/geometry.js'

const EXHAUST_RATE = 70 // particles per second per engine
const ADDITIVE = new Set(['ember', 'flash', 'spark'])

// Explosions: smoke under, flash + sparks on top. Engine exhaust: embers and puffs blown out of the nozzles.
// Render-only, so Math.random is fine.
export function createEffects() {
  let particles = []

  return {
    explode(at) {
      particles.push(...burst(at))
    },

    exhaust(r, engineOffset, dt) {
      for (const [side, on] of [[-1, r.input.left], [1, r.input.right]]) {
        if (!on) continue
        for (let n = Math.floor(EXHAUST_RATE * dt + Math.random()); n > 0; n--) particles.push(exhaustParticle(r, side * engineOffset))
      }
    },

    draw(ctx, dt) {
      particles = particles.filter((p) => (p.life -= dt) > 0)
      for (const p of particles) move(p, dt)
      const drawn = (glow) => {
        for (const p of particles) if (ADDITIVE.has(p.kind) === glow) DRAW[p.kind](ctx, p, p.life / p.max) // t: 1 → 0
      }
      drawn(false)
      additive(ctx, () => drawn(true))
    },
  }
}

function burst({ x, y, team }) {
  const at = { x, y }
  const smoke = Array.from({ length: 12 }, () =>
    particle(at, [20, 80], [1.2, 2], { kind: 'smoke', gravity: -30, size: 6 + Math.random() * 6 }),
  )
  const flash = { x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, kind: 'flash', gravity: 0, size: 60 }
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
function exhaustParticle(r, x) {
  const [px, py] = toWorld(r, [x, NOZZLE_Y])
  const [vx, vy] = rotate(rand(-35, 35), rand(150, 260), r.angle)
  const ember = Math.random() < 0.45
  const life = ember ? rand(0.15, 0.35) : rand(0.45, 0.85)
  return {
    x: px,
    y: py,
    vx: r.vx + vx,
    vy: r.vy + vy,
    life,
    max: life,
    kind: ember ? 'ember' : 'puff',
    gravity: 0,
    size: ember ? rand(1.2, 2.4) : rand(2.5, 4.5),
  }
}

function move(p, dt) {
  p.vy += p.gravity * dt
  if (p.kind === 'smoke' || p.kind === 'puff') {
    p.vx *= 1 - 2.5 * dt
    p.vy *= 1 - 2.5 * dt
  }
  p.x += p.vx * dt
  p.y += p.vy * dt
}

const DRAW = {
  smoke: (ctx, p, t) => disc(ctx, p, p.size * (2 - t), { color: COLOR.smoke, alpha: t * 0.45 }),
  puff: (ctx, p, t) => disc(ctx, p, p.size * (3.2 - 2.2 * t), { color: COLOR.exhaust, alpha: t * 0.4 }),
  ember: (ctx, p, t) => disc(ctx, p, p.size * (0.5 + t * 0.5), { color: COLOR.flame[t > 0.5 ? 0 : 1], alpha: t }),
  flash: (ctx, p, t) => glowDot(ctx, p.x, p.y, { radius: p.size * (1.6 - t), color: COLOR.spark[0], alpha: t }),
  spark(ctx, p, t) {
    ctx.globalAlpha = t
    ctx.strokeStyle = p.color
    ctx.lineWidth = p.size
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.globalAlpha = 1
  },
}

function disc(ctx, { x, y }, radius, { color, alpha }) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

// speed, life: [min, max]
function particle({ x, y }, speed, life, extra) {
  const a = Math.random() * TAU
  const v = rand(...speed)
  const max = rand(...life)
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, ...extra }
}
