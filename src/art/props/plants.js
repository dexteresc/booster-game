import { COLOR } from '../theme.js'
import { TAU, chrome, groundShadow } from '../brush.js'

// Alien palm in a chrome planter: five teal fronds with orange tips, swaying.
export function drawPalm(ctx, { x, y }, clock) {
  const crown = { x: x + 4, y: y - 40 }
  groundShadow(ctx, x, y, 9)
  ctx.fillStyle = COLOR.metalDark
  ctx.fillRect(x - 7, y - 6, 14, 6)
  ctx.fillStyle = chrome(ctx, x - 8, x + 8)
  ctx.fillRect(x - 8, y - 8, 16, 2)
  ctx.strokeStyle = chrome(ctx, x - 3, x + 3)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y - 8)
  ctx.quadraticCurveTo(x - 6, y - 24, crown.x, crown.y)
  ctx.stroke()
  ctx.strokeStyle = COLOR.teal
  ctx.fillStyle = COLOR.trim
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.55 + Math.sin(clock * 1.5 + i) * 0.08
    const tip = { x: crown.x + Math.cos(a) * 18, y: crown.y + Math.sin(a) * 18 + 6 }
    ctx.beginPath()
    ctx.moveTo(crown.x, crown.y)
    ctx.quadraticCurveTo(crown.x + Math.cos(a) * 14, crown.y + Math.sin(a) * 14 - 6, tip.x, tip.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 2, 0, TAU)
    ctx.fill()
  }
}
