import { COLOR } from '../theme.js'
import { TAU, additive, chrome, glowDot, groundShadow, shaded } from '../brush.js'

// Props that glow: street lamp, starburst sign, rotating beacon.

const LAMP = { height: 64, reach: 16, head: 9 } // pole height, how far the arm swoops out, saucer radius
const STAR = { height: 66, radius: 16 }

// Googie street lamp: chrome pole, swooping arm, flying-saucer head pooling light on the ground.
export function drawLamp(ctx, { x, y }, clock) {
  const top = y - LAMP.height
  const hx = x + LAMP.reach
  const flicker = 0.85 + 0.15 * Math.sin(clock * 9) * Math.sin(clock * 2.3)

  groundShadow(ctx, x, y, 9)
  ctx.fillStyle = COLOR.metalDark
  ctx.fillRect(x - 6, y - 4, 12, 4)
  ctx.fillStyle = chrome(ctx, x - 2, x + 2)
  ctx.fillRect(x - 2, top + 12, 4, LAMP.height - 16)
  ctx.strokeStyle = chrome(ctx, x - 2, hx)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, top + 12)
  ctx.quadraticCurveTo(x, top, hx, top)
  ctx.stroke()

  ctx.fillStyle = COLOR.cream
  ctx.beginPath()
  ctx.ellipse(hx, top, LAMP.head, 3.5, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = COLOR.lampLight
  ctx.beginPath()
  ctx.ellipse(hx, top + 2, LAMP.head - 2.5, 2, 0, 0, Math.PI)
  ctx.fill()

  additive(ctx, () => {
    const cone = ctx.createLinearGradient(0, top, 0, y)
    cone.addColorStop(0, COLOR.lampLight)
    cone.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.22 * flicker
    ctx.fillStyle = cone
    ctx.beginPath()
    ctx.moveTo(hx - 5, top + 3)
    ctx.lineTo(hx + 5, top + 3)
    ctx.lineTo(hx + 24, y)
    ctx.lineTo(hx - 24, y)
    ctx.fill()
    ctx.globalAlpha = 1
    glowDot(ctx, hx, top + 3, { radius: 22, color: COLOR.lampLight, alpha: 0.8 * flicker })
  })
}

// Sputnik starburst sign on a chrome pole, pulsing orange.
export function drawStarburst(ctx, { x, y }, clock) {
  const cy = y - STAR.height + STAR.radius
  const pulse = 0.7 + 0.3 * Math.sin(clock * 3)
  groundShadow(ctx, x, y, 8)
  ctx.fillStyle = COLOR.metalDark
  ctx.fillRect(x - 5, y - 3, 10, 3)
  ctx.fillStyle = chrome(ctx, x - 2, x + 2)
  ctx.fillRect(x - 2, cy, 4, y - 3 - cy)
  star(ctx, { x, y: cy, outer: STAR.radius, inner: 6 }, COLOR.trim)
  star(ctx, { x, y: cy, outer: 8, inner: 3 }, COLOR.cream)
  ctx.fillStyle = COLOR.signal
  ctx.beginPath()
  ctx.arc(x, cy, 3, 0, TAU)
  ctx.fill()
  additive(ctx, () => glowDot(ctx, x, cy, { radius: 30, color: COLOR.trim, alpha: 0.5 * pulse }))
}

function star(ctx, { x, y, outer, inner }, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const a = (i * TAU) / 16 - Math.PI / 2
    const r = i % 2 ? inner : outer
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
}

// Airport-style beacon: cream drum, chrome ring, red dome, beam sweeping round once per 2 s.
export function drawBeacon(ctx, { x, y }, clock) {
  const a = clock * Math.PI
  const across = Math.cos(a) // beam direction left ↔ right
  const toward = Math.sin(a) // > 0: beam swings past the viewer, dome flares
  const top = y - 14
  groundShadow(ctx, x, y, 8)
  ctx.fillStyle = shaded(ctx, x - 6, x + 6, COLOR.creamShaded)
  ctx.fillRect(x - 6, y - 12, 12, 12)
  ctx.fillStyle = chrome(ctx, x - 7, x + 7)
  ctx.fillRect(x - 7, top, 14, 3)
  ctx.fillStyle = COLOR.signal
  ctx.beginPath()
  ctx.arc(x, top, 7, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = COLOR.gloss
  ctx.beginPath()
  ctx.arc(x - 3, top - 3, 1.5, 0, TAU)
  ctx.fill()
  additive(ctx, () => {
    const tip = { x: x + across * 60, y: top - 12 }
    ctx.globalAlpha = 0.35 * Math.abs(across)
    ctx.fillStyle = COLOR.signal
    ctx.beginPath()
    ctx.moveTo(x, top - 4)
    ctx.lineTo(tip.x, tip.y - 7)
    ctx.lineTo(tip.x, tip.y + 7)
    ctx.fill()
    ctx.globalAlpha = 1
    glowDot(ctx, x, top - 3, { radius: 16, color: COLOR.signal, alpha: Math.max(0.2, toward) })
  })
}
