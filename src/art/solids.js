import { COLOR } from './theme.js'
import { TAU } from './brush.js'

// Solids: the rects rockets collide with, drawn by kind. sky: palette from SKIES,
// so everything is lit to match the time of day. Water is in sea.js.
// New material → a draw function here and its name in SOLID_KINDS (maps/parse.js).

export const SOLID_ART = { rock: drawRock, concrete: drawConcrete, metal: drawMetal, hazard: drawHazard, panel: drawPanel, glass: drawGlass }

const BLOCK = { w: 80, h: 40 } // cast concrete blocks, staggered like brickwork
const PLATE = { h: 30, rivet: 20 } // steel plates, riveted along the seams
const STRIPE = 14 // hazard stripe width
const PANEL = 48 // cream wall panels
const TRIM_EVERY = 4 // panel rows per orange trim band
const PANE = 32 // glass block size

// Water is skipped: the sea is drawn last by createScenery().water(), over everything it reflects.
export function drawSolid(ctx, s, sky) {
  if (s.kind === 'water') return
  const draw = SOLID_ART[s.kind ?? 'rock']
  if (!draw) throw new Error(`drawSolid: unknown solid kind "${s.kind}"`)
  draw(ctx, s, sky)
}

export function drawRock(ctx, s, sky) {
  vertical(ctx, s, sky.rock, 20)
  ctx.fillStyle = COLOR.strata
  for (let y = s.y + 14; y < s.y + s.h; y += 17) ctx.fillRect(s.x, y, s.w, 1.5)
  ctx.fillRect(s.x + s.w - 4, s.y, 4, s.h)
  ctx.fillStyle = sky.rockLip
  ctx.fillRect(s.x, s.y, s.w, 3)
}

function drawConcrete(ctx, s, sky) {
  vertical(ctx, s, sky.concrete, 30)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += BLOCK.h) {
      if (row) seam(ctx, { x: s.x, y, w: s.w, h: 2 })
      for (let x = s.x + (row % 2 ? BLOCK.w / 2 : BLOCK.w); x < s.x + s.w; x += BLOCK.w) seam(ctx, { x, y, w: 2, h: BLOCK.h })
    }
  })
  edges(ctx, s, COLOR.lip, COLOR.strata)
}

function drawMetal(ctx, s, sky) {
  const [light, mid, shadow] = sky.metal
  clipped(ctx, s, () => {
    for (let y = s.y; y < s.y + s.h; y += PLATE.h) {
      const g = ctx.createLinearGradient(0, y, 0, y + PLATE.h)
      g.addColorStop(0, light)
      g.addColorStop(0.35, mid)
      g.addColorStop(1, shadow)
      ctx.fillStyle = g
      ctx.fillRect(s.x, y, s.w, PLATE.h)
      if (y > s.y) {
        seam(ctx, { x: s.x, y, w: s.w, h: 2 })
        rivets(ctx, y + 7, { x0: s.x + PLATE.rivet / 2, x1: s.x + s.w, step: PLATE.rivet })
      }
    }
  })
  edges(ctx, s, light, COLOR.metalDark)
}

// Mustard with dark diagonal stripes: mark edges that bite.
function drawHazard(ctx, s, sky) {
  ctx.fillStyle = COLOR.hazard
  ctx.fillRect(s.x, s.y, s.w, s.h)
  clipped(ctx, s, () => {
    ctx.fillStyle = sky.metal[2]
    for (let x = s.x - s.h; x < s.x + s.w; x += STRIPE * 2) {
      ctx.beginPath()
      ctx.moveTo(x, s.y + s.h)
      ctx.lineTo(x + STRIPE, s.y + s.h)
      ctx.lineTo(x + STRIPE + s.h, s.y)
      ctx.lineTo(x + s.h, s.y)
      ctx.fill()
    }
  })
  const shade = ctx.createLinearGradient(0, s.y, 0, s.y + s.h)
  shade.addColorStop(0, 'rgba(255,255,255,0.15)')
  shade.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = shade
  ctx.fillRect(s.x, s.y, s.w, s.h)
  edges(ctx, s, COLOR.lip, COLOR.strata)
}

// Cream wall panels with corner rivets and an orange trim band every few rows.
function drawPanel(ctx, s, sky) {
  const [light, base, shade] = sky.panel
  vertical(ctx, s, [light, base, shade], s.h / 2)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += PANEL) {
      for (let x = s.x; x < s.x + s.w; x += PANEL) {
        ctx.fillStyle = shade
        ctx.fillRect(x + PANEL - 1, y, 1, PANEL)
        ctx.fillRect(x, y + PANEL - 1, PANEL, 1)
        ctx.fillStyle = COLOR.seamLit
        ctx.fillRect(x, y, PANEL, 1)
        ctx.fillRect(x, y, 1, PANEL)
      }
      rivets(ctx, y + 5, { x0: s.x + 5, x1: s.x + s.w, step: PANEL })
      rivets(ctx, y + PANEL - 6, { x0: s.x + 5, x1: s.x + s.w, step: PANEL })
      if (row % TRIM_EVERY === TRIM_EVERY - 1) {
        ctx.fillStyle = COLOR.trim
        ctx.fillRect(s.x, y + PANEL - 8, s.w, 6)
      }
    }
  })
  edges(ctx, s, COLOR.lip, COLOR.strata)
}

// Glass blocks in a gunmetal frame; some light up after dark.
function drawGlass(ctx, s, sky) {
  const [top, bottom] = sky.glass
  ctx.fillStyle = sky.metal[1]
  ctx.fillRect(s.x, s.y, s.w, s.h)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += PANE) {
      for (let col = 0, x = s.x; x < s.x + s.w; col++, x += PANE) {
        const g = ctx.createLinearGradient(0, y, 0, y + PANE)
        g.addColorStop(0, top)
        g.addColorStop(1, bottom)
        ctx.fillStyle = g
        ctx.fillRect(x + 3, y + 3, PANE - 6, PANE - 6)
        if (sky.windows && (col * 7 + row * 13) % 5 === 0) {
          ctx.fillStyle = COLOR.windowLight
          ctx.globalAlpha = 0.45
          ctx.fillRect(x + 3, y + 3, PANE - 6, PANE - 6)
          ctx.globalAlpha = 1
        }
        ctx.fillStyle = COLOR.gloss
        ctx.fillRect(x + 5, y + 5, PANE - 14, 2)
        ctx.fillRect(x + 5, y + 5, 2, PANE - 14)
      }
    }
  })
  edges(ctx, s, sky.metal[0], COLOR.metalDark)
}

// Top-lit gradient: colors = [top, mid, base], mid reached `lit` units down.
function vertical(ctx, s, [top, mid, base], lit) {
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h)
  g.addColorStop(0, top)
  g.addColorStop(Math.min(1, lit / s.h), mid)
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fillRect(s.x, s.y, s.w, s.h)
}

// Lit top lip, shaded right edge: light comes from the upper left everywhere.
function edges(ctx, s, lip, shade) {
  ctx.fillStyle = shade
  ctx.fillRect(s.x + s.w - 3, s.y, 3, s.h)
  ctx.fillStyle = lip
  ctx.fillRect(s.x, s.y, s.w, 3)
}

function clipped(ctx, { x, y, w, h }, draw) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  draw()
  ctx.restore()
}

// Dark joint with a lit edge below / right of it, so it reads as a groove.
function seam(ctx, { x, y, w, h }) {
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = COLOR.seamLit
  if (w > h) ctx.fillRect(x, y + h, w, 1)
  else ctx.fillRect(x + w, y, 1, h)
}

// A row of rivet heads from x0 to x1, one path so it's cheap on big walls.
function rivets(ctx, y, { x0, x1, step }) {
  for (const [dx, dy, color] of [[0.5, 0.5, COLOR.rivetDark], [0, 0, COLOR.seamLit]]) {
    ctx.fillStyle = color
    ctx.beginPath()
    for (let x = x0; x < x1; x += step) {
      ctx.moveTo(x + dx, y + dy)
      ctx.arc(x + dx, y + dy, 1.6, 0, TAU)
    }
    ctx.fill()
  }
}
