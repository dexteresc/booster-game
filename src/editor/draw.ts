import { flagHome, hasFlag } from '../sim/game.ts'
import { TEAMS } from '../maps/parse.ts'
import type { Biome, CannonSpot, GameMap, Rect } from '../maps/parse.ts'
import { cannonPedestal, restingAim } from '../sim/cannon.ts'
import { COLOR, SKIES } from '../art/theme.ts'
import { fitCanvas } from '../art/brush.ts'
import { drawFlag, drawPad } from '../art/scenery.ts'
import { drawRock, drawSolid } from '../art/solids.ts'
import { drawProp } from '../art/props/index.ts'
import { propBounds } from '../art/props/boxes.ts'
import { drawCannon } from '../art/sprites.ts'
import { context2d } from '../dom.ts'
import { GRID, boundsOf, isPropKind } from './model.ts'
import type { Editor, PlacingTool, Point } from './model.ts'

// Plain daylight, no weather or parallax: easy to see what's where.
// Play the map for the real look.
const SKY = SKIES.day
const WATER_BASE = '#2a6f95'
const GRID_MAJOR = GRID * 10
const SELECT = '#ff7a1a'
const PREVIEW_BLOCK = { w: 120, h: 60 } // world units shown in a block tool's tile
const PREVIEW_GROUND = 8 // rock under a prop in its tile

type Ctx = CanvasRenderingContext2D
// In world units, drawing into 0..w × 0..h.
type PreviewBox = { w: number; h: number; draw: (ctx: Ctx) => void }

export function drawEditor(canvas: HTMLCanvasElement, editor: Editor, clock: number): void {
  const ctx = context2d(canvas)
  const { dpr, w, h } = fitCanvas(canvas)
  const { map, view } = editor
  const scale = view.zoom * dpr
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = COLOR.void
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(scale, 0, 0, scale, w / 2 - view.x * scale, h / 2 - view.y * scale)

  drawSky(ctx, map, map.height)
  drawGrid(ctx, map, 1 / view.zoom)
  for (const s of map.solids) drawSolid(ctx, s, SKY, map.biome)
  for (const c of map.cannons) drawStandingCannon(ctx, c, map.biome, clock)
  for (const team of TEAMS) {
    const base = map.bases[team]
    drawPad(ctx, base.pad, team, clock)
    if (hasFlag(map.mode, team)) drawFlag(ctx, flagHome(base), team, clock)
  }
  for (const p of map.props) drawProp(ctx, p, clock)
  for (const s of map.solids) {
    if (s.kind === 'water') drawWater(ctx, s)
  }
  if (editor.selected) drawSelection(ctx, boundsOf(editor.selected), 1 / view.zoom)
}

// Tool tile: the object as it looks on a map of this biome, fitted into the canvas.
export function drawPreview(canvas: HTMLCanvasElement, tool: PlacingTool, biome: Biome): void {
  const ctx = context2d(canvas)
  const { w, h } = fitCanvas(canvas)
  const box = previewBox(tool, biome)
  const scale = Math.min(w / box.w, h / box.h) * 0.85
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawSky(ctx, { width: w, height: h }, h)
  ctx.setTransform(scale, 0, 0, scale, (w - box.w * scale) / 2, (h - box.h * scale) / 2)
  box.draw(ctx)
}

function previewBox(tool: PlacingTool, biome: Biome): PreviewBox {
  const { w, h } = PREVIEW_BLOCK
  if (tool === 'water') return { w, h, draw: (ctx) => drawWater(ctx, { x: 0, y: 0, w, h }) }
  if (tool === 'cannon') {
    return standing(
      boundsOf({ kind: 'cannon', obj: { x: 0, y: 0, team: 'red' } }),
      biome,
      (ctx, c) => drawStandingCannon(ctx, { ...c, team: 'red' }, biome, 0),
    )
  }
  if (isPropKind(tool)) {
    return standing(
      propBounds({ kind: tool, x: 0, y: 0 }),
      biome,
      (ctx, p) => drawProp(ctx, { ...p, kind: tool }, 0),
    )
  }
  return { w, h, draw: (ctx) => drawSolid(ctx, { x: 0, y: 0, w, h, ...(tool !== 'rock' && { kind: tool }) }, SKY, biome) }
}

// Something with its foot at (0, 0) and the given bounds, on a strip of rock.
function standing(bounds: Rect, biome: Biome, draw: (ctx: Ctx, foot: Point) => void): PreviewBox {
  const pad = 6
  const w = bounds.w + pad * 2
  const h = bounds.h + PREVIEW_GROUND + pad
  const foot = { x: pad - bounds.x, y: h - PREVIEW_GROUND }
  return {
    w,
    h,
    draw(ctx: Ctx) {
      drawRock(ctx, { x: 0, y: foot.y, w, h: PREVIEW_GROUND }, SKY, biome)
      draw(ctx, foot)
    },
  }
}

function drawStandingCannon(ctx: Ctx, cannon: CannonSpot, biome: Biome, clock: number): void {
  drawRock(ctx, cannonPedestal(cannon), SKY, biome)
  drawCannon(ctx, { ...cannon, aim: restingAim(cannon) }, false, clock)
}

function drawSky(ctx: Ctx, { width, height }: Pick<GameMap, 'width' | 'height'>, gradientHeight: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, gradientHeight)
  for (const [at, color] of SKY.sky) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
}

// px: one screen pixel in world units.
function drawGrid(ctx: Ctx, map: GameMap, px: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let x = 0; x <= map.width; x += GRID_MAJOR) ctx.fillRect(x, 0, px, map.height)
  for (let y = 0; y <= map.height; y += GRID_MAJOR) ctx.fillRect(0, y, map.width, px)
  ctx.strokeStyle = COLOR.text
  ctx.lineWidth = 2 * px
  ctx.strokeRect(0, 0, map.width, map.height)
}

function drawWater(ctx: Ctx, water: Rect): void {
  ctx.fillStyle = WATER_BASE
  ctx.fillRect(water.x, water.y, water.w, water.h)
  const tint = ctx.createLinearGradient(0, water.y, 0, water.y + water.h)
  tint.addColorStop(0, SKY.water[0])
  tint.addColorStop(1, SKY.water[1])
  ctx.fillStyle = tint
  ctx.fillRect(water.x, water.y, water.w, water.h)
  ctx.fillStyle = SKY.waterLine
  ctx.fillRect(water.x, water.y, water.w, 2)
}

function drawSelection(ctx: Ctx, rect: Rect, px: number): void {
  ctx.strokeStyle = SELECT
  ctx.lineWidth = 2 * px
  ctx.setLineDash([6 * px, 4 * px])
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.setLineDash([])
  ctx.fillStyle = SELECT
  const size = 7 * px
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ]
  for (const [x, y] of corners) {
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }
}
