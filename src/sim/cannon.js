import { solidAt, wrapAngle } from './geometry.js'

export const BARREL_LENGTH = 20
export const PIVOT_HEIGHT = 14

// Cannon x,y is the surface point it stands on.
export function cannonPedestal(c) {
  return { x: c.x - 14, y: c.y - 12, w: 28, h: 12 }
}

export function stepCannons(game, config, dt) {
  const { enabled, range, bulletSpeed, fireInterval, turnSpeed, aimTolerance, leadTarget } = config.cannon
  if (!enabled) return
  for (const cannon of game.cannons) {
    cannon.cooldown -= dt
    const px = cannon.x
    const py = cannon.y - PIVOT_HEIGHT
    const target = nearestEnemy(game.rockets, cannon.team, { x: px, y: py }, range)
    if (!target) continue

    let tx = target.x
    let ty = target.y
    if (leadTarget) {
      const t = Math.hypot(tx - px, ty - py) / bulletSpeed
      tx += target.vx * t
      ty += target.vy * t
    }
    const error = wrapAngle(Math.atan2(ty - py, tx - px) - cannon.aim)
    const maxTurn = turnSpeed * dt
    cannon.aim = wrapAngle(cannon.aim + Math.max(-maxTurn, Math.min(maxTurn, error)))

    if (cannon.cooldown <= 0 && Math.abs(error) < aimTolerance) {
      const dx = Math.cos(cannon.aim)
      const dy = Math.sin(cannon.aim)
      game.bullets.push({
        x: px + dx * BARREL_LENGTH,
        y: py + dy * BARREL_LENGTH,
        vx: dx * bulletSpeed,
        vy: dy * bulletSpeed,
        team: cannon.team,
        life: range / bulletSpeed,
      })
      cannon.cooldown = fireInterval
    }
  }
}

function nearestEnemy(rockets, team, from, range) {
  let best = null
  let bestDist = range
  for (const r of rockets) {
    if (!r.alive || r.team === team) continue
    const d = Math.hypot(r.x - from.x, r.y - from.y)
    if (d <= bestDist) {
      best = r
      bestDist = d
    }
  }
  return best
}

// Moves bullets, drops spent ones. Returns rockets hit this tick.
export function stepBullets(game, config, dt) {
  const hits = []
  const { hitRadius } = config.rocket
  game.bullets = game.bullets.filter((b) => {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    if (b.life <= 0 || solidAt(game.map, b.x, b.y)) return false
    const hit = game.rockets.find((r) => r.alive && r.team !== b.team && Math.hypot(r.x - b.x, r.y - b.y) < hitRadius)
    if (hit) hits.push(hit)
    return !hit
  })
  return hits
}
