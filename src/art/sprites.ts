import { FEET } from '../sim/rocket.ts'
import { BARREL_LENGTH, PIVOT_HEIGHT, cannonPedestal } from '../sim/cannon.ts'
import { COLOR, TEAM } from './theme.ts'
import { SKINS } from './skins.ts'
import { TAU, additive, chrome, glowDot, shaded } from './brush.ts'
import type { Palette, TeamColors } from './theme.ts'
import type { Skin } from './skins.ts'
import type { Cannon } from '../sim/cannon.ts'
import type { ShownBullet, ShownRocket } from '../sim/game.ts'

// Things that move. Each draws a sim object at its own world position,
// so /art.html can show them with fake objects.

// Hull shapes per body skin; the classic one is roughly the hull collision points in sim/rocket.ts.
const BODIES = Object.fromEntries(
  Object.entries(SKINS.body).map(([id, body]) => [id, { path: new Path2D(body.path), tip: body.tip }]),
) as Record<Skin['body'], { path: Path2D; tip: number }>
const LASER_LENGTH = 24

type DrawnRocket = Pick<ShownRocket, 'x' | 'y' | 'team' | 'angle' | 'input' | 'skin'>
// What the skin settles: hull from its paint (or the team's); accent stays the team's so sides stay telling.
type Finish = { hull: Palette; accent: string; body: (typeof BODIES)[Skin['body']]; flame: readonly [string, string, string] }
type DrawnCannon = Pick<Cannon, 'x' | 'y' | 'team' | 'aim'>

// isMe: outline the local player's rocket so it stands out in multiplayer.
export function drawRocket(ctx: CanvasRenderingContext2D, rocket: DrawnRocket, engineOffset: number, isMe = false) {
  const finish = finishOf(rocket)
  ctx.save()
  ctx.translate(rocket.x, rocket.y)
  ctx.rotate(rocket.angle)

  additive(ctx, () => {
    if (rocket.input.left) drawPlume(ctx, -engineOffset, 16, finish.flame)
    if (rocket.input.right) drawPlume(ctx, engineOffset, 16, finish.flame)
  })
  drawLegs(ctx, finish.accent)

  // Strut: its width shows the balance setting
  ctx.fillStyle = chrome(ctx, -engineOffset, engineOffset)
  ctx.fillRect(-engineOffset, 6, engineOffset * 2, 2.5)
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 0.8
  for (const x of [-engineOffset, engineOffset]) drawPod(ctx, x, finish)

  drawHull(ctx, finish, isMe)
  drawAntenna(ctx, finish)
  drawPorthole(ctx)
  ctx.restore()
}

function finishOf({ team, skin }: Pick<DrawnRocket, 'team' | 'skin'>): Finish {
  const colors: TeamColors = TEAM[team]
  return {
    hull: SKINS.paint[skin.paint].hull ?? colors.hull,
    accent: colors.accent,
    body: BODIES[skin.body],
    flame: SKINS.flame[skin.flame].colors,
  }
}

// Landing legs with ball feet
function drawLegs(ctx: CanvasRenderingContext2D, accent: string) {
  ctx.strokeStyle = chrome(ctx, -13, 13)
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [fx, fy] of FEET) {
    ctx.moveTo(Math.sign(fx) * 5, 6)
    ctx.lineTo(fx, fy - 2)
  }
  ctx.stroke()
  ctx.fillStyle = accent
  for (const [fx, fy] of FEET) {
    ctx.beginPath()
    ctx.arc(fx, fy - 2, 2, 0, TAU)
    ctx.fill()
  }
}

function drawHull(ctx: CanvasRenderingContext2D, { accent, hull, body }: Finish, isMe: boolean) {
  ctx.fillStyle = shaded(ctx, -8, 8, hull)
  ctx.fill(body.path)
  ctx.save()
  ctx.clip(body.path)
  ctx.fillStyle = accent
  ctx.fillRect(-10, body.tip - 1, 20, 8) // nose cap
  ctx.fillRect(-8, -1, 16, 4) // belly band
  ctx.fillStyle = COLOR.rivet
  for (let x = -6; x <= 6; x += 3) {
    ctx.fillRect(x - 0.4, -2.6, 0.8, 0.8)
    ctx.fillRect(x - 0.4, 4.4, 0.8, 0.8)
  }
  ctx.fillStyle = COLOR.gloss
  ctx.fillRect(-5.5, -18, 1.5, 24)
  ctx.restore()
  ctx.strokeStyle = isMe ? COLOR.meOutline : COLOR.outline
  ctx.lineWidth = isMe ? 1.5 : 1
  ctx.stroke(body.path)
}

function drawAntenna(ctx: CanvasRenderingContext2D, { accent, body }: Finish) {
  ctx.strokeStyle = chrome(ctx, -1, 1)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, body.tip)
  ctx.lineTo(0, body.tip - 5)
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(0, body.tip - 5.5, 1.3, 0, TAU)
  ctx.fill()
}

// Chrome ring, dark glass
function drawPorthole(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = chrome(ctx, -4, 4)
  ctx.beginPath()
  ctx.arc(0, -10, 4.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = COLOR.canopy
  ctx.beginPath()
  ctx.arc(0, -10, 2.9, 0, TAU)
  ctx.fill()
  ctx.fillStyle = COLOR.canopyGlint
  ctx.beginPath()
  ctx.ellipse(-1, -11, 0.8, 1.3, -0.5, 0, TAU)
  ctx.fill()
}

// Bullet-nosed booster with a swept fin on its outer side.
function drawPod(ctx: CanvasRenderingContext2D, x: number, { accent, hull }: Finish) {
  const side = Math.sign(x) // -1 left, 1 right
  ctx.fillStyle = chrome(ctx, x - 4, x + 4)
  ctx.beginPath()
  ctx.moveTo(x - 2.5, 12)
  ctx.lineTo(x + 2.5, 12)
  ctx.lineTo(x + 4, 16.5)
  ctx.lineTo(x - 4, 16.5)
  ctx.fill()

  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(x + side * 3, 1)
  ctx.quadraticCurveTo(x + side * 10, 5, x + side * 9.5, 16)
  ctx.lineTo(x + side * 3, 11)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = shaded(ctx, x - 4, x + 4, hull)
  ctx.beginPath()
  ctx.moveTo(x - 4, 12)
  ctx.lineTo(x - 4, 2)
  ctx.quadraticCurveTo(x - 4, -5, x, -6)
  ctx.quadraticCurveTo(x + 4, -5, x + 4, 2)
  ctx.lineTo(x + 4, 12)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = chrome(ctx, x - 4, x + 4)
  ctx.fillRect(x - 4, 9.5, 8, 2.5)
}

function drawPlume(ctx: CanvasRenderingContext2D, x: number, y: number, flame: Finish['flame']) {
  const len = 22 + Math.random() * 12
  const g = ctx.createLinearGradient(0, y, 0, y + len)
  g.addColorStop(0, flame[0])
  g.addColorStop(0.3, flame[1])
  g.addColorStop(1, flame[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - 4.5, y)
  ctx.quadraticCurveTo(x, y + len * 2, x + 4.5, y)
  ctx.fill()
  glowDot(ctx, x, y + 2, { radius: 10, color: flame[1], alpha: 0.4 })
}

// Ray-gun turret. firing: show a muzzle flash this frame.
export function drawCannon(ctx: CanvasRenderingContext2D, cannon: DrawnCannon, firing: boolean, clock: number) {
  const { accent, laser } = TEAM[cannon.team]
  const p = cannonPedestal(cannon)
  ctx.fillStyle = shaded(ctx, p.x, p.x + p.w, COLOR.gunmetal)
  ctx.fillRect(p.x, p.y, p.w, p.h)
  ctx.fillStyle = accent
  ctx.fillRect(p.x, p.y + 4, p.w, 2)
  ctx.fillStyle = chrome(ctx, p.x, p.x + p.w)
  ctx.fillRect(p.x, p.y, p.w, 1.5)

  drawBarrel(ctx, cannon, laser, firing)
  drawDome(ctx, cannon, accent)
  drawOrbit(ctx, cannon, accent, clock)
}

// Ribbed barrel with an emitter bulb
function drawBarrel(ctx: CanvasRenderingContext2D, cannon: DrawnCannon, laser: string, firing: boolean) {
  ctx.save()
  ctx.translate(cannon.x, cannon.y - PIVOT_HEIGHT)
  ctx.rotate(cannon.aim)
  ctx.fillStyle = chrome(ctx, 0, BARREL_LENGTH)
  ctx.fillRect(0, -1.8, BARREL_LENGTH - 3, 3.6)
  for (const rx of [6, 10, 14]) ctx.fillRect(rx, -4, 1.8, 8)
  ctx.fillStyle = laser
  ctx.beginPath()
  ctx.arc(BARREL_LENGTH - 1, 0, 2.6, 0, TAU)
  ctx.fill()
  additive(ctx, () => glowDot(ctx, BARREL_LENGTH - 1, 0, {
    radius: firing ? 16 : 7,
    color: laser,
    alpha: firing ? 1 : 0.6,
  }))
  ctx.restore()
}

// Dome with glowing sensor eye
function drawDome(ctx: CanvasRenderingContext2D, cannon: DrawnCannon, accent: string) {
  const top = cannonPedestal(cannon).y
  const eyeY = cannon.y - PIVOT_HEIGHT + 1
  ctx.fillStyle = shaded(ctx, cannon.x - 11, cannon.x + 11, COLOR.gunmetal)
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cannon.x, top, 11, Math.PI, 0)
  ctx.fill()
  ctx.stroke()
  additive(ctx, () => glowDot(ctx, cannon.x, eyeY, { radius: 6, color: accent, alpha: 0.9 }))
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(cannon.x, eyeY, 1.8, 0, TAU)
  ctx.fill()
}

// Atom orbit with a circling electron
function drawOrbit(ctx: CanvasRenderingContext2D, cannon: DrawnCannon, accent: string, clock: number) {
  const cy = cannonPedestal(cannon).y - 5
  const tilt = -0.35
  ctx.strokeStyle = accent
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.ellipse(cannon.x, cy, 15, 4, tilt, 0, TAU)
  ctx.stroke()
  const a = clock * 3
  const ex = Math.cos(a) * 15
  const ey = Math.sin(a) * 4
  const x = cannon.x + ex * Math.cos(tilt) - ey * Math.sin(tilt)
  const y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)
  additive(ctx, () => glowDot(ctx, x, y, { radius: 4, color: accent }))
}

export function drawLaser(ctx: CanvasRenderingContext2D, bullet: ShownBullet) {
  const { laser } = TEAM[bullet.team]
  const k = LASER_LENGTH / Math.hypot(bullet.vx, bullet.vy)
  additive(ctx, () => {
    ctx.lineCap = 'round'
    for (const [width, color, alpha] of [[9, laser, 0.2], [4, laser, 0.7], [1.5, '#fff', 1]] as const) {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(bullet.x - bullet.vx * k, bullet.y - bullet.vy * k)
      ctx.lineTo(bullet.x, bullet.y)
      ctx.stroke()
    }
  })
}
