import { COLOR } from './theme.ts'
import { TAU } from './brush.ts'
import type { GroundColors, Palette } from './theme.ts'
import type { Biome, Rect } from '../maps/parse.ts'

// The natural ground of each biome: what a 'rock' solid looks like there.

type DrawGround = (ctx: CanvasRenderingContext2D, s: Rect, colors: GroundColors) => void

export const GROUND_ART: Record<Biome, DrawGround> = {
  desert: drawSandstone,
  jungle: drawMossStone,
  nautic: drawBasalt,
  belt: drawAsteroid,
}

const STRATA = 17
const CRACK = 50 // moss stone: one crack per this many units of width
const VINE = 60 // moss stone: one vine per this many units of width
// Rock 05 by Rob Tuytel, Poly Haven (polyhaven.com/a/rock_05), CC0, with light from the upper left baked in
// from its normal and ambient-occlusion maps.
const ROCK_TEXTURE = new URL('./textures/rock_05.jpg', import.meta.url).href
const ROCK_TEXTURE_SCALE = 0.8 // world units per texture pixel
// Starts loading with the page, so it's usually there before a belt game lays out its background.
const rock = {
  image: typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: ROCK_TEXTURE }),
  loads: 0,
}
rock.image?.addEventListener('load', () => rock.loads++)

// How many ground images have loaded: art baked from the ground art redraws when it changes.
export const groundLoads = () => rock.loads

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

// Asteroid rock: a lit photo texture, or the sky's ground colours until it has loaded.
// Tiled with plain image draws on a world grid: a pattern of an image this big costs every canvas that
// makes one a copy of it, and enough of those slow the whole page.
function drawAsteroid(ctx: CanvasRenderingContext2D, solid: Rect, { body }: GroundColors) {
  const { image } = rock
  if (!image?.complete || !image.naturalWidth) {
    vertical(ctx, solid, body, Math.max(16, solid.h * 0.4))
    return
  }
  const tile = image.width * ROCK_TEXTURE_SCALE
  ctx.save()
  ctx.beginPath()
  ctx.rect(solid.x, solid.y, solid.w, solid.h)
  ctx.clip()
  for (let x = Math.floor(solid.x / tile) * tile; x < solid.x + solid.w; x += tile) {
    for (let y = Math.floor(solid.y / tile) * tile; y < solid.y + solid.h; y += tile) {
      ctx.drawImage(image, x, y, tile + 1, tile + 1) // overlap by a unit, so no seam shows between tiles
    }
  }
  ctx.restore()
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
