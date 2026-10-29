import { COLOR } from '../theme.js'
import { TAU, groundShadow, shaded } from '../brush.js'

// Stone idol in profile on a stepped plinth, moss on its crown. Faces right; flip it to face left.
export function drawStatue(ctx, { x, y }) {
  groundShadow(ctx, x, y, 18)
  ctx.fillStyle = shaded(ctx, x - 18, x + 18, COLOR.stoneShaded)
  ctx.fillRect(x - 18, y - 6, 36, 6)
  ctx.fillRect(x - 14, y - 11, 28, 5)
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x - 18, y - 6, 36, 1)

  ctx.fillStyle = shaded(ctx, x - 12, x + 14, COLOR.stoneShaded)
  ctx.beginPath()
  ctx.moveTo(x - 12, y - 11)
  ctx.lineTo(x - 12, y - 52)
  ctx.lineTo(x + 2, y - 57)
  ctx.lineTo(x + 8, y - 47)
  ctx.lineTo(x + 7, y - 43)
  ctx.lineTo(x + 14, y - 38)
  ctx.lineTo(x + 7, y - 35)
  ctx.lineTo(x + 10, y - 30)
  ctx.lineTo(x + 6, y - 26)
  ctx.lineTo(x + 6, y - 11)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x + 1, y - 45, 6, 3) // eye socket
  ctx.fillRect(x + 7, y - 42, 2, 3) // nostril shadow
  ctx.fillRect(x - 10, y - 44, 3, 11) // ear
  ctx.fillRect(x - 12, y - 24, 18, 1) // a crack
  ctx.fillStyle = COLOR.seamLit
  ctx.fillRect(x + 2, y - 47, 6, 1)

  ctx.fillStyle = COLOR.moss
  ctx.beginPath()
  ctx.ellipse(x - 5, y - 54, 8, 3, 0, 0, TAU)
  ctx.ellipse(x - 10, y - 49, 2.5, 5, 0, 0, TAU)
  ctx.fill()
}
