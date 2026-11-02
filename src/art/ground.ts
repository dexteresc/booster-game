import { COLOR } from './theme.ts'
import { TAU, hash } from './brush.ts'
import { drawLitAsteroid } from './asteroid.ts'
import type { GroundColors, Palette } from './theme.ts'
import type { Biome, Rect } from '../maps/parse.ts'
import type { PlacedSolid } from '../sim/geometry.ts'

// The natural ground of each biome: what a 'rock' solid looks like there.

type DrawGround = (ctx: CanvasRenderingContext2D, s: Rect, colors: GroundColors) => void
type DrawShapedGround = (ctx: CanvasRenderingContext2D, s: PlacedSolid, colors: GroundColors) => void

export const GROUND_ART: Record<Biome, DrawGround> = {
  desert: drawSandstone,
  jungle: drawMossStone,
  nautic: drawBasalt,
  belt: drawAsteroidSlab,
}
// Ground that draws its round, lumpy or spinning rocks whole: outline, light and turn.
export const SHAPED_GROUND_ART: Partial<Record<Biome, DrawShapedGround>> = { belt: drawLitAsteroid }

const STRATA = 17
const CRACK = 50 // moss stone: one crack per this many units of width
const VINE = 60 // moss stone: one vine per this many units of width

// Layered sandstone with a sunlit lip.
function drawSandstone(ctx: CanvasRenderingContext2D, solid: Rect, { body, lip }: GroundColors) {
  vertical(ctx, solid, body, 20)
  ctx.fillStyle = COLOR.strata
  for (let y = solid.y + 14; y < solid.y + solid.h; y += STRATA) ctx.fillRect(solid.x, y, solid.w, 1.5)
  ctx.fillRect(solid.x + solid.w - 4, solid.y, 4, solid.h)
  ctx.fillStyle = lip
  ctx.fillRect(solid.x, solid.y, solid.w, 3)
}

// Dark stone with cracks, a grassy top and vines hanging off the underside.
function drawMossStone(ctx: CanvasRenderingContext2D, solid: Rect, { body, lip }: GroundColors) {
  vertical(ctx, solid, body, 24)
  ctx.strokeStyle = COLOR.seam
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i * CRACK < solid.w; i++) {
    const x = solid.x + ((i * 37) % CRACK) + i * CRACK
    const y = solid.y + 6 + ((i * 53) % Math.max(1, solid.h - 12))
    ctx.moveTo(x, y)
    ctx.lineTo(x + 8, y + 5)
    ctx.lineTo(x + 6, y + 14)
  }
  ctx.stroke()
  ctx.fillStyle = COLOR.strata
  ctx.fillRect(solid.x + solid.w - 4, solid.y, 4, solid.h)
  ctx.fillStyle = lip
  ctx.fillRect(solid.x, solid.y, solid.w, 4)
  for (let x = solid.x + 5; x < solid.x + solid.w - 3; x += 11) ctx.fillRect(x, solid.y + 4, 3, 3 + ((x * 7) % 5))
  ctx.strokeStyle = COLOR.moss
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let x = solid.x + 14; x < solid.x + solid.w - 8; x += VINE) {
    const len = 10 + ((x * 13) % 18)
    ctx.moveTo(x, solid.y + solid.h)
    ctx.quadraticCurveTo(x - 4, solid.y + solid.h + len * 0.6, x + 2, solid.y + solid.h + len)
  }
  ctx.stroke()
}

// Wet basalt: tide-darkened base, barnacles and a coral tuft or two, spray-white lip.
function drawBasalt(ctx: CanvasRenderingContext2D, solid: Rect, { body, lip }: GroundColors) {
  vertical(ctx, solid, body, 18)
  const tide = Math.min(solid.h, 22)
  const wet = ctx.createLinearGradient(0, solid.y + solid.h - tide, 0, solid.y + solid.h)
  wet.addColorStop(0, 'rgba(0,0,0,0)')
  wet.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = wet
  ctx.fillRect(solid.x, solid.y + solid.h - tide, solid.w, tide)
  ctx.fillStyle = COLOR.barnacle
  ctx.beginPath()
  for (let i = 0; i * 9 < solid.w - 6; i++) {
    const x = solid.x + 4 + i * 9 + ((i * 5) % 4)
    const y = solid.y + solid.h - 3 - ((i * 11) % Math.max(1, tide - 6))
    ctx.moveTo(x + 1.2, y)
    ctx.arc(x, y, 1.2, 0, TAU)
  }
  ctx.fill()
  ctx.fillStyle = COLOR.coral
  for (let x = solid.x + 30; x < solid.x + solid.w - 10; x += 110) {
    ctx.beginPath()
    for (const dx of [-4, 0, 4]) ctx.ellipse(x + dx, solid.y + solid.h - 4, 2.5, 4 + Math.abs(dx), 0, Math.PI, TAU)
    ctx.fill()
  }
  ctx.fillStyle = COLOR.strata
  ctx.fillRect(solid.x + solid.w - 4, solid.y, 4, solid.h)
  ctx.fillStyle = lip
  ctx.fillRect(solid.x, solid.y, solid.w, 2)
}

// Square asteroid rock: speckled dust under a lit lip.
function drawAsteroidSlab(ctx: CanvasRenderingContext2D, solid: Rect, { body, lip }: GroundColors) {
  vertical(ctx, solid, body, Math.max(16, solid.h * 0.4))
  const seed = Math.round(solid.x) * 7919 + Math.round(solid.y)
  const specks = Math.min(500, (solid.w * solid.h) / 220)
  for (const [shade, color] of [[0, COLOR.strata], [1, COLOR.seamLit]] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    for (let i = shade; i < specks; i += 2) {
      ctx.rect(solid.x + hash(seed, i, 1) * solid.w, solid.y + hash(seed, i, 2) * solid.h, 1.5, 1.5)
    }
    ctx.fill()
  }
  ctx.fillStyle = lip
  ctx.fillRect(solid.x, solid.y, solid.w, 2)
}

// Top-lit gradient: colors = [top, mid, base], mid reached `lit` units down.
export function vertical(ctx: CanvasRenderingContext2D, rect: Rect, [top, mid, base]: Palette, lit: number) {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h)
  g.addColorStop(0, top)
  g.addColorStop(rect.h > 0 ? Math.min(1, lit / rect.h) : 1, mid) // h is 0 while a new block is dragged out
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
}
