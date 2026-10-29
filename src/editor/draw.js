import { flagHome } from '../sim/game.js'
import { cannonPedestal } from '../sim/cannon.js'
import { COLOR, SKIES } from '../art/theme.js'
import { fitCanvas } from '../art/brush.js'
import { drawFlag, drawPad, drawRock } from '../art/scenery.js'
import { drawCannon } from '../art/sprites.js'
import { GRID, boundsOf } from './model.js'

// Plain daylight, no weather or parallax: easy to see what's where.
// Play the map for the real look.
const SKY = SKIES.day
const WATER_BASE = '#2a6f95'
const GRID_MAJOR = GRID * 10
const SELECT = '#ff7a1a'

export function drawEditor(canvas, editor, clock) {
  const ctx = canvas.getContext('2d')
  const { dpr, w, h } = fitCanvas(canvas)
  const { map, view } = editor
  const scale = view.zoom * dpr
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = COLOR.void
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(scale, 0, 0, scale, w / 2 - view.x * scale, h / 2 - view.y * scale)

  drawSky(ctx, map)
  drawGrid(ctx, map, 1 / view.zoom)
  for (const s of map.solids) if (!s.water) drawRock(ctx, s, SKY)
  for (const c of map.cannons) {
    drawRock(ctx, cannonPedestal(c), SKY)
    drawCannon(ctx, { ...c, aim: -Math.PI / 2 }, false, clock)
  }
  for (const [team, base] of Object.entries(map.bases)) {
    drawPad(ctx, base.pad, team, clock)
    drawFlag(ctx, flagHome(base), team, clock)
  }
  for (const s of map.solids) if (s.water) drawWater(ctx, s)
  if (editor.selected) drawSelection(ctx, boundsOf(editor.selected), 1 / view.zoom)
}

function drawSky(ctx, map) {
  const g = ctx.createLinearGradient(0, 0, 0, map.height)
  for (const [at, color] of SKY.sky) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, map.width, map.height)
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
