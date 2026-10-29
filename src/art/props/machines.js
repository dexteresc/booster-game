import { COLOR } from '../theme.js'
import { TAU, additive, chrome, glowDot, groundShadow, shaded } from '../brush.js'

// Hardware standing around: finned fuel tank, radar mast, parked flying saucer.

// Cream capsule on three struts, chrome bands, orange nose and swept fins.
export function drawTank(ctx, { x, y }) {
  groundShadow(ctx, x, y, 14)
  ctx.strokeStyle = COLOR.metalDark
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const [fx, tx] of [[-6, -9], [0, 0], [6, 9]]) {
    ctx.moveTo(x + fx, y - 5)
    ctx.lineTo(x + tx, y)
  }
  ctx.stroke()
  ctx.fillStyle = COLOR.trim
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x + side * 9, y - 24)
    ctx.lineTo(x + side * 17, y - 1)
    ctx.lineTo(x + side * 9, y - 6)
    ctx.fill()
  }
  ctx.fillStyle = shaded(ctx, x - 10, x + 10, COLOR.creamShaded)
  ctx.beginPath()
  ctx.roundRect(x - 10, y - 38, 20, 34, 6)
  ctx.fill()
  ctx.fillStyle = chrome(ctx, x - 10, x + 10)
  ctx.fillRect(x - 10, y - 30, 20, 3)
  ctx.fillRect(x - 10, y - 15, 20, 3)
  ctx.fillStyle = COLOR.signal
  ctx.fillRect(x - 10, y - 23, 20, 3)
  ctx.fillStyle = COLOR.trim
  ctx.beginPath()
  ctx.moveTo(x - 8, y - 37)
  ctx.lineTo(x + 8, y - 37)
  ctx.lineTo(x, y - 46)
  ctx.fill()
  ctx.strokeStyle = COLOR.outline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x - 10, y - 38, 20, 34, 6)
  ctx.stroke()
}

// Lattice mast with a chrome dish that slowly turns; red feed light blinks.
export function drawRadar(ctx, { x, y }, clock) {
  const top = y - 52
  const turn = 0.3 + 0.7 * Math.abs(Math.cos(clock * 0.7))
  const blink = Math.sin(clock * 4) > 0.3
  groundShadow(ctx, x, y, 12)
  ctx.fillStyle = COLOR.creamShade
  ctx.beginPath()
  ctx.moveTo(x - 10, y)
  ctx.lineTo(x + 10, y)
  ctx.lineTo(x + 4, top)
  ctx.lineTo(x - 4, top)
  ctx.fill()
  ctx.strokeStyle = COLOR.rivet
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const y0 = y - i * 13
    const y1 = y0 - 13
    const w0 = 10 - (i * 6) / 4
    const w1 = 10 - ((i + 1) * 6) / 4
    ctx.moveTo(x - w0, y0)
    ctx.lineTo(x + w1, y1)
    ctx.moveTo(x + w0, y0)
    ctx.lineTo(x - w1, y1)
  }
  ctx.stroke()
  ctx.fillStyle = chrome(ctx, x - 14, x + 14)
  ctx.fillRect(x - 1.5, top - 6, 3, 6)
  ctx.beginPath()
  ctx.ellipse(x, top - 8, 14 * turn, 7, 0, 0, Math.PI)
  ctx.fill()
  ctx.fillStyle = COLOR.metalDark
  ctx.fillRect(x - 1, top - 16, 2, 8)
  ctx.fillStyle = COLOR.signal
  ctx.beginPath()
  ctx.arc(x, top - 17, 2, 0, TAU)
  ctx.fill()
  if (blink) additive(ctx, () => glowDot(ctx, x, top - 17, { radius: 10, color: COLOR.signal }))
}

// Parked saucer: chrome hull on three feet, teal dome, lit portholes along the rim.
export function drawSaucer(ctx, { x, y }, clock) {
  const hy = y - 14
  const [light, mid, shadow] = COLOR.gunmetal
  groundShadow(ctx, x, y, 30)
  ctx.strokeStyle = COLOR.metalDark
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const [fx, tx, fy] of [[-18, -22, 6], [0, 0, 9], [18, 22, 6]]) {
    ctx.moveTo(x + fx, hy + fy)
    ctx.lineTo(x + tx, y)
  }
  ctx.stroke()
  const hull = ctx.createLinearGradient(0, hy - 9, 0, hy + 9)
  hull.addColorStop(0, light)
  hull.addColorStop(0.5, mid)
  hull.addColorStop(1, shadow)
  ctx.fillStyle = hull
  ctx.beginPath()
  ctx.ellipse(x, hy, 34, 9, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = COLOR.gloss
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(x, hy - 1, 30, 5, 0, Math.PI, TAU)
  ctx.stroke()
  const dome = ctx.createLinearGradient(0, hy - 17, 0, hy - 7)
  dome.addColorStop(0, COLOR.teal)
  dome.addColorStop(1, COLOR.tealDeep)
  ctx.fillStyle = dome
  ctx.beginPath()
  ctx.arc(x, hy - 7, 10, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = COLOR.gloss
  ctx.fillRect(x - 5, hy - 14, 3, 2)
  additive(ctx, () => {
    for (let i = -2; i <= 2; i++) glowDot(ctx, x + i * 12, hy + 3, { radius: 5, color: COLOR.windowLight })
    glowDot(ctx, x, hy + 9, { radius: 20, color: COLOR.teal, alpha: 0.3 + 0.1 * Math.sin(clock * 2) })
  })
}
