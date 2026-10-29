import { COLOR } from './theme.js'
import { TAU } from './brush.js'

// The natural ground of each biome: what a 'rock' solid looks like there.
// sky.ground[biome] = { body: [top, mid, base], lip }.

export const GROUND_ART = { desert: drawSandstone, jungle: drawMossStone, nautic: drawBasalt }

const STRATA = 17
const CRACK = 50 // moss stone: one crack per this many units of width
const VINE = 60 // moss stone: one vine per this many units of width

// Layered sandstone with a sunlit lip.
function drawSandstone(ctx, s, { body, lip }) {
  vertical(ctx, s, body, 20)
  ctx.fillStyle = COLOR.strata
  for (let y = s.y + 14; y < s.y + s.h; y += STRATA) ctx.fillRect(s.x, y, s.w, 1.5)
  ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h)
  ctx.fillStyle = lip
  ctx.fillRect(s.x, s.y, s.w, 3)
}

// Dark stone with cracks, a grassy top and vines hanging off the underside.
function drawMossStone(ctx, s, { body, lip }) {
  vertical(ctx, s, body, 24)
  ctx.strokeStyle = COLOR.seam
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i * CRACK < s.w; i++) {
    const x = s.x + ((i * 37) % CRACK) + i * CRACK
    const y = s.y + 6 + ((i * 53) % Math.max(1, s.h - 12))
    ctx.moveTo(x, y)
    ctx.lineTo(x + 8, y + 5)
    ctx.lineTo(x + 6, y + 14)
  }
  ctx.stroke()
  ctx.fillStyle = COLOR.strata
  ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h)
  ctx.fillStyle = lip
  ctx.fillRect(s.x, s.y, s.w, 4)
  for (let x = s.x + 5; x < s.x + s.w - 3; x += 11) ctx.fillRect(x, s.y + 4, 3, 3 + ((x * 7) % 5))
  ctx.strokeStyle = COLOR.moss
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let x = s.x + 14; x < s.x + s.w - 8; x += VINE) {
    const len = 10 + ((x * 13) % 18)
    ctx.moveTo(x, s.y + s.h)
    ctx.quadraticCurveTo(x - 4, s.y + s.h + len * 0.6, x + 2, s.y + s.h + len)
  }
  ctx.stroke()
}

// Wet basalt: tide-darkened base, barnacles and a coral tuft or two, spray-white lip.
function drawBasalt(ctx, s, { body, lip }) {
  vertical(ctx, s, body, 18)
  const tide = Math.min(s.h, 22)
  const wet = ctx.createLinearGradient(0, s.y + s.h - tide, 0, s.y + s.h)
  wet.addColorStop(0, 'rgba(0,0,0,0)')
  wet.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = wet
  ctx.fillRect(s.x, s.y + s.h - tide, s.w, tide)
  ctx.fillStyle = COLOR.barnacle
  ctx.beginPath()
  for (let i = 0; i * 9 < s.w - 6; i++) {
    const x = s.x + 4 + i * 9 + ((i * 5) % 4)
    const y = s.y + s.h - 3 - ((i * 11) % Math.max(1, tide - 6))
    ctx.moveTo(x + 1.2, y)
    ctx.arc(x, y, 1.2, 0, TAU)
  }
  ctx.fill()
  ctx.fillStyle = COLOR.coral
  for (let x = s.x + 30; x < s.x + s.w - 10; x += 110) {
    ctx.beginPath()
    for (const dx of [-4, 0, 4]) ctx.ellipse(x + dx, s.y + s.h - 4, 2.5, 4 + Math.abs(dx), 0, Math.PI, TAU)
    ctx.fill()
  }
  ctx.fillStyle = COLOR.strata
  ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h)
  ctx.fillStyle = lip
  ctx.fillRect(s.x, s.y, s.w, 2)
}

// Top-lit gradient: colors = [top, mid, base], mid reached `lit` units down.
export function vertical(ctx, s, [top, mid, base], lit) {
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h)
  g.addColorStop(0, top)
  g.addColorStop(s.h > 0 ? Math.min(1, lit / s.h) : 1, mid) // h is 0 while a new block is dragged out
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fillRect(s.x, s.y, s.w, s.h)
}
