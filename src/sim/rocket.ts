import type { Config } from '../config.ts'
import type { GameMap, Rect, Team } from '../maps/parse.ts'
import type { Skin } from '../art/skins.ts'
import { rotate, solidAt, surfaceAt, wrapAngle } from './geometry.ts'

export type Input = { left: boolean; right: boolean }

export type Rocket = {
  id: string
  team: Team
  name: string
  skin: Skin // cosmetic, drawn by src/art/; carried here like name so joiners hear it in the roster
  slot: number // place along the team's pad
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  alive: boolean
  landed: boolean
  input: Input
  respawnAt: number // game.time of the next respawn; only means something while dead
}

type Point = readonly [x: number, y: number]

// Local shape: origin = center of mass, -y = nose. Angle 0 = upright, positive = clockwise.
// Hull points crash on any contact; only the feet may touch ground.
const HULL: readonly Point[] = [[0, -24], [-8, -10], [8, -10], [-8, 0], [8, 0], [-8, 8], [8, 8]]
export const FEET: readonly Point[] = [[-13, 18], [13, 18]]
export const FOOT_Y = 18
const MAX_FOOT_SINK = 8 // a foot deeper than this (beyond this tick's fall) hit a wall side, not a top surface
const MAX_SLOPE = 1 // feet on a curved top steeper than 45° slip off: crash

export const NO_INPUT: Readonly<Input> = Object.freeze({ left: false, right: false })
export const SLOT_SPACING = 40 // spawn slots sit this far apart along a pad, the first one this far in

// Everything a respawn resets.
export function spawnState(slot: number, pad: Rect) {
  return {
    x: pad.x + (slot + 1) * SLOT_SPACING,
    y: pad.y - FOOT_Y,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    alive: true,
    landed: true,
    input: NO_INPUT,
  }
}

// Returns true if the rocket crashed this tick.
export function stepRocket(rocket: Rocket, map: GameMap, config: Config, dt: number): boolean {
  const { thrust, engineOffset, inertia, spinDamping, drag } = config.rocket
  const left = rocket.input.left ? thrust : 0
  const right = rocket.input.right ? thrust : 0

  // Left engine pushes the left side up → clockwise torque → nose tilts right.
  rocket.spin += (((left - right) * engineOffset) / inertia) * dt
  rocket.spin *= Math.max(0, 1 - spinDamping * dt)
  rocket.angle = wrapAngle(rocket.angle + rocket.spin * dt)

  const push = left + right
  rocket.vx += push * Math.sin(rocket.angle) * dt
  rocket.vy += (config.world.gravity * (map.gravity ?? 1) - push * Math.cos(rocket.angle)) * dt
  const keep = Math.max(0, 1 - drag * dt)
  rocket.vx *= keep
  rocket.vy *= keep
  rocket.x += rocket.vx * dt
  rocket.y += rocket.vy * dt

  return resolveContact(rocket, map, config.rocket.safeLandingAngle, dt)
}

function toWorld(rocket: Pick<Rocket, 'x' | 'y' | 'angle'>, [lx, ly]: Point): Point {
  const [dx, dy] = rotate(lx, ly, rocket.angle)
  return [rocket.x + dx, rocket.y + dy]
}

function resolveContact(rocket: Rocket, map: GameMap, safeLandingAngle: number, dt: number): boolean {
  rocket.landed = false
  if (HULL.some((p) => solidAt(map, ...toWorld(rocket, p)))) return true

  const maxSink = MAX_FOOT_SINK + Math.max(0, rocket.vy) * dt
  let surface = Infinity
  for (const p of FEET) {
    const [x, y] = toWorld(rocket, p)
    const rect = solidAt(map, x, y)
    if (!rect) continue
    const top = surfaceAt(rect, x, -1)
    if (!top || y - top.y > maxSink || top.slope > MAX_SLOPE) return true
    surface = Math.min(surface, top.y)
  }
  if (surface === Infinity) return false

  if (Math.abs(rocket.angle) > safeLandingAngle) return true
  Object.assign(rocket, { y: surface - FOOT_Y, angle: 0, spin: 0, vx: 0, vy: 0, landed: true })
  return false
}
