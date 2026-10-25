import { COLOR, TEAM } from './theme.js'
import { TAU, additive, glowDot, rand } from './brush.js'

// Explosions: smoke under, flash + sparks on top. Render-only, so Math.random is fine.
export function createEffects() {
  let particles = []

  return {
    explode(at) {
      particles.push(...burst(at))
    },

    draw(ctx, dt) {
      particles = particles.filter((p) => (p.life -= dt) > 0)
      for (const p of particles) {
        move(p, dt)
        DRAW[p.kind](ctx, p, p.life / p.max) // t: 1 → 0
      }
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

function move(p, dt) {
  p.vy += p.gravity * dt
  if (p.kind === 'smoke') p.vx *= 1 - 1.5 * dt
  p.x += p.vx * dt
  p.y += p.vy * dt
}

const DRAW = {
  smoke(ctx, p, t) {
    ctx.globalAlpha = t * 0.45
    ctx.fillStyle = COLOR.smoke
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (2 - t), 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1
  },
  flash(ctx, p, t) {
    additive(ctx, () => glowDot(ctx, p.x, p.y, { radius: p.size * (1.6 - t), color: COLOR.spark[0], alpha: t }))
  },
  spark(ctx, p, t) {
    additive(ctx, () => {
      ctx.globalAlpha = t
      ctx.strokeStyle = p.color
      ctx.lineWidth = p.size
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    })
  },
}

// speed, life: [min, max]
function particle({ x, y }, speed, life, extra) {
  const a = Math.random() * TAU
  const v = rand(...speed)
  const max = rand(...life)
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, ...extra }
}
