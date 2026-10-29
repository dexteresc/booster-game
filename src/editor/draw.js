import { flagHome } from '../sim/game.js'
import { PROP_KINDS } from '../maps/parse.js'
import { cannonPedestal } from '../sim/cannon.js'
import { COLOR, SKIES } from '../art/theme.js'
import { fitCanvas } from '../art/brush.js'
import { drawFlag, drawPad } from '../art/scenery.js'
import { drawRock, drawSolid } from '../art/solids.js'
import { drawProp, propBounds } from '../art/props/index.js'
import { drawCannon } from '../art/sprites.js'
import { GRID, boundsOf } from './model.js'

// Plain daylight, no weather or parallax: easy to see what's where.
// Play the map for the real look.
const SKY = SKIES.day
const WATER_BASE = '#2a6f95'
const GRID_MAJOR = GRID * 10
const SELECT = '#ff7a1a'
const PREVIEW_BLOCK = { w: 120, h: 60 } // world units shown in a block tool's tile
const PREVIEW_GROUND = 8 // rock under a prop in its tile

export function drawEditor(canvas, editor, clock) {
  const ctx = canvas.getContext('2d')
  const { dpr, w, h } = fitCanvas(canvas)
  const { map, view } = editor
  const scale = view.zoom * dpr
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = COLOR.void
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(scale, 0, 0, scale, w / 2 - view.x * scale, h / 2 - view.y * scale)

  drawSky(ctx, map, map.height)
  drawGrid(ctx, map, 1 / view.zoom)
  for (const s of map.solids) drawSolid(ctx, s, SKY)
  for (const c of map.cannons) drawStandingCannon(ctx, c, clock)
  for (const [team, base] of Object.entries(map.bases)) {
    drawPad(ctx, base.pad, team, clock)
    drawFlag(ctx, flagHome(base), team, clock)
  }
  for (const p of map.props) drawProp(ctx, p, clock)
  for (const s of map.solids) if (s.kind === 'water') drawWater(ctx, s)
  if (editor.selected) drawSelection(ctx, boundsOf(editor.selected), 1 / view.zoom)
}

// Tool tile: the object as it looks on the map, fitted into the canvas.
export function drawPreview(canvas, tool) {
  const ctx = canvas.getContext('2d')
  const { w, h } = fitCanvas(canvas)
  const box = previewBox(tool)
  const scale = Math.min(w / box.w, h / box.h) * 0.85
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawSky(ctx, { width: w, height: h }, h)
  ctx.setTransform(scale, 0, 0, scale, (w - box.w * scale) / 2, (h - box.h * scale) / 2)
  box.draw(ctx)
}

// { w, h, draw } in world units, drawing into 0..w × 0..h.
function previewBox(tool) {
  const { w, h } = PREVIEW_BLOCK
  if (tool === 'water') return { w, h, draw: (ctx) => drawWater(ctx, { x: 0, y: 0, w, h }) }
  if (tool === 'cannon') return standing(boundsOf({ kind: 'cannon', obj: { x: 0, y: 0 } }), (ctx, c) => drawStandingCannon(ctx, { ...c, team: 'red' }, 0))
  if (PROP_KINDS.includes(tool)) return standing(propBounds({ kind: tool, x: 0, y: 0 }), (ctx, p) => drawProp(ctx, { ...p, kind: tool }, 0))
  return { w, h, draw: (ctx) => drawSolid(ctx, { x: 0, y: 0, w, h, kind: tool }, SKY) }
}

// Something with its foot at (0, 0) and the given bounds, on a strip of rock.
function standing(bounds, draw) {
  const pad = 6
  const w = bounds.w + pad * 2
  const h = bounds.h + PREVIEW_GROUND + pad
  const foot = { x: pad - bounds.x, y: h - PREVIEW_GROUND }
  return {
    w,
    h,
    draw(ctx) {
      drawRock(ctx, { x: 0, y: foot.y, w, h: PREVIEW_GROUND }, SKY)
      draw(ctx, foot)
    },
  }
}

function drawStandingCannon(ctx, c, clock) {
  drawRock(ctx, cannonPedestal(c), SKY)
  drawCannon(ctx, { ...c, aim: -Math.PI / 2 }, false, clock)
}

function drawSky(ctx, { width, height }, gradientHeight) {
  const g = ctx.createLinearGradient(0, 0, 0, gradientHeight)
  for (const [at, color] of SKY.sky) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
}

// px: one screen pixel in world units.
function drawGrid(ctx, map, px) {
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let x = 0; x <= map.width; x += GRID_MAJOR) ctx.fillRect(x, 0, px, map.height)
  for (let y = 0; y <= map.height; y += GRID_MAJOR) ctx.fillRect(0, y, map.width, px)
  ctx.strokeStyle = COLOR.text
  ctx.lineWidth = 2 * px
  ctx.strokeRect(0, 0, map.width, map.height)
}

function drawWater(ctx, s) {
  ctx.fillStyle = WATER_BASE
  ctx.fillRect(s.x, s.y, s.w, s.h)
  const tint = ctx.createLinearGradient(0, s.y, 0, s.y + s.h)
  tint.addColorStop(0, SKY.water[0])
  tint.addColorStop(1, SKY.water[1])
  ctx.fillStyle = tint
  ctx.fillRect(s.x, s.y, s.w, s.h)
  ctx.fillStyle = SKY.waterLine
  ctx.fillRect(s.x, s.y, s.w, 2)
}

function drawSelection(ctx, r, px) {
  ctx.strokeStyle = SELECT
  ctx.lineWidth = 2 * px
  ctx.setLineDash([6 * px, 4 * px])
  ctx.strokeRect(r.x, r.y, r.w, r.h)
  ctx.setLineDash([])
  ctx.fillStyle = SELECT
  const size = 7 * px
  for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
  }
}
