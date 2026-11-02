import type { Config } from '../config.ts'
import type { CannonSpot, Rect, Team } from '../maps/parse.ts'
import type { Game } from './game.ts'
import type { Rocket } from './rocket.ts'
import { solidAt, wrapAngle } from './geometry.ts'

export type Cannon = CannonSpot & { aim: number; cooldown: number }
export type Bullet = { x: number; y: number; vx: number; vy: number; team: Team; life: number }

export const BARREL_LENGTH = 20
export const PIVOT_HEIGHT = 14

// Cannon x,y is the surface point it stands on, or with `hang` the underside point it hangs from.
export function cannonPedestal(cannon: Pick<CannonSpot, 'x' | 'y' | 'hang'>): Rect {
  return { x: cannon.x - 14, y: cannon.hang ? cannon.y : cannon.y - 12, w: 28, h: 12 }
}

// Straight out from the surface it's on.
export function restingAim(cannon: Pick<CannonSpot, 'hang'>): number {
  return cannon.hang ? Math.PI / 2 : -Math.PI / 2
}

function pivot(cannon: CannonSpot) {
  return { x: cannon.x, y: cannon.hang ? cannon.y + PIVOT_HEIGHT : cannon.y - PIVOT_HEIGHT }
}

export function stepCannons(game: Game, config: Config, dt: number): void {
  const { enabled, bulletSpeed, fireInterval, turnSpeed, aimTolerance, leadTarget } = config.cannon
  const range = game.map.cannonRange ?? config.cannon.range
  if (!enabled) return
  for (const cannon of game.cannons) {
    cannon.cooldown -= dt
    const { x: px, y: py } = pivot(cannon)
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

function nearestEnemy(rockets: Rocket[], team: Team, from: { x: number; y: number }, range: number): Rocket | null {
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
export function stepBullets(game: Game, config: Config, dt: number): Rocket[] {
  const hits: Rocket[] = []
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
