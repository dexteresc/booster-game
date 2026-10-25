import { FEET } from '../sim/rocket.js'
import { BARREL_LENGTH, PIVOT_HEIGHT, cannonPedestal } from '../sim/cannon.js'
import { COLOR, TEAM } from './theme.js'
import { TAU, additive, chrome, glowDot, shaded } from './brush.js'

// Things that move. Each draws a sim object at its own world position,
// so /art.html can show them with fake objects.

// Ogive hull; roughly the hull collision points in sim/rocket.js.
const BODY = new Path2D('M0 -26 C5 -22 8 -14 8 -6 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 L-8 -6 C-8 -14 -5 -22 0 -26 Z')
const LASER_LENGTH = 24

// isMe: outline the local player's rocket so it stands out in multiplayer.
export function drawRocket(ctx, r, engineOffset, isMe = false) {
  const colors = TEAM[r.team]
  ctx.save()
  ctx.translate(r.x, r.y)
  ctx.rotate(r.angle)

  additive(ctx, () => {
    if (r.input.left) drawPlume(ctx, -engineOffset, 16)
    if (r.input.right) drawPlume(ctx, engineOffset, 16)
  })
  drawLegs(ctx, colors.accent)

  // Strut: its width shows the balance setting
  ctx.fillStyle = chrome(ctx, -engineOffset, engineOffset)
  ctx.fillRect(-engineOffset, 6, engineOffset * 2, 2.5)
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 0.8
  for (const x of [-engineOffset, engineOffset]) drawPod(ctx, x, colors)

  drawHull(ctx, colors, isMe)
  drawAntenna(ctx, colors.accent)
  drawPorthole(ctx)
  ctx.restore()
}

// Landing legs with ball feet
function drawLegs(ctx, accent) {
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

function drawHull(ctx, { accent, hull }, isMe) {
  ctx.fillStyle = shaded(ctx, -8, 8, hull)
  ctx.fill(BODY)
  ctx.save()
  ctx.clip(BODY)
  ctx.fillStyle = accent
  ctx.fillRect(-8, -27, 16, 8) // nose cap
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
  ctx.stroke(BODY)
}

function drawAntenna(ctx, accent) {
  ctx.strokeStyle = chrome(ctx, -1, 1)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, -26)
  ctx.lineTo(0, -31)
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(0, -31.5, 1.3, 0, TAU)
  ctx.fill()
}

// Chrome ring, dark glass
function drawPorthole(ctx) {
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
function drawPod(ctx, x, { accent, hull }) {
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

function drawPlume(ctx, x, y) {
  const len = 22 + Math.random() * 12
  const g = ctx.createLinearGradient(0, y, 0, y + len)
  g.addColorStop(0, COLOR.flame[0])
  g.addColorStop(0.3, COLOR.flame[1])
  g.addColorStop(1, COLOR.flame[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - 4.5, y)
  ctx.quadraticCurveTo(x, y + len * 2, x + 4.5, y)
  ctx.fill()
  glowDot(ctx, x, y + 2, { radius: 10, color: COLOR.flame[1], alpha: 0.4 })
}

// Ray-gun turret. firing: show a muzzle flash this frame.
export function drawCannon(ctx, c, firing, clock) {
  const { accent, laser } = TEAM[c.team]
  const p = cannonPedestal(c)
  ctx.fillStyle = shaded(ctx, p.x, p.x + p.w, COLOR.gunmetal)
  ctx.fillRect(p.x, p.y, p.w, p.h)
  ctx.fillStyle = accent
  ctx.fillRect(p.x, p.y + 4, p.w, 2)
  ctx.fillStyle = chrome(ctx, p.x, p.x + p.w)
  ctx.fillRect(p.x, p.y, p.w, 1.5)

  drawBarrel(ctx, c, laser, firing)
  drawDome(ctx, c, accent)
  drawOrbit(ctx, c, accent, clock)
}

// Ribbed barrel with an emitter bulb
function drawBarrel(ctx, c, laser, firing) {
  ctx.save()
  ctx.translate(c.x, c.y - PIVOT_HEIGHT)
  ctx.rotate(c.aim)
  ctx.fillStyle = chrome(ctx, 0, BARREL_LENGTH)
  ctx.fillRect(0, -1.8, BARREL_LENGTH - 3, 3.6)
  for (const rx of [6, 10, 14]) ctx.fillRect(rx, -4, 1.8, 8)
  ctx.fillStyle = laser
  ctx.beginPath()
  ctx.arc(BARREL_LENGTH - 1, 0, 2.6, 0, TAU)
  ctx.fill()
  additive(ctx, () => glowDot(ctx, BARREL_LENGTH - 1, 0, { radius: firing ? 16 : 7, color: laser, alpha: firing ? 1 : 0.6 }))
  ctx.restore()
}

// Dome with glowing sensor eye
function drawDome(ctx, c, accent) {
  const top = cannonPedestal(c).y
  const eyeY = c.y - PIVOT_HEIGHT + 1
  ctx.fillStyle = shaded(ctx, c.x - 11, c.x + 11, COLOR.gunmetal)
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(c.x, top, 11, Math.PI, 0)
  ctx.fill()
  ctx.stroke()
  additive(ctx, () => glowDot(ctx, c.x, eyeY, { radius: 6, color: accent, alpha: 0.9 }))
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(c.x, eyeY, 1.8, 0, TAU)
  ctx.fill()
}

// Atom orbit with a circling electron
function drawOrbit(ctx, c, accent, clock) {
  const cy = cannonPedestal(c).y - 5
  const tilt = -0.35
  ctx.strokeStyle = accent
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.ellipse(c.x, cy, 15, 4, tilt, 0, TAU)
  ctx.stroke()
  const a = clock * 3
  const ex = Math.cos(a) * 15
  const ey = Math.sin(a) * 4
  const x = c.x + ex * Math.cos(tilt) - ey * Math.sin(tilt)
  const y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)
  additive(ctx, () => glowDot(ctx, x, y, { radius: 4, color: accent }))
}

export function drawLaser(ctx, b) {
  const { laser } = TEAM[b.team]
  const k = LASER_LENGTH / Math.hypot(b.vx, b.vy)
  additive(ctx, () => {
    ctx.lineCap = 'round'
    for (const [width, color, alpha] of [[9, laser, 0.2], [4, laser, 0.7], [1.5, '#fff', 1]]) {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(b.x - b.vx * k, b.y - b.vy * k)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  })
}
