import { COLOR } from './theme.ts'
import { TAU, turnedAbout } from './brush.ts'
import { drawShaped } from './shapes.ts'
import { drawLitRock } from './rocks.ts'
import { GROUND_ART, vertical } from './ground.ts'
import type { Sky } from './theme.ts'
import type { Biome, Rect, SolidKind } from '../maps/parse.ts'
import type { PlacedSolid } from '../sim/geometry.ts'

// Solids: the rects rockets collide with, drawn by kind. sky: palette from SKIES,
// so everything is lit to match the time of day. Rock looks like the biome's ground
// (ground.ts); water is in sea.ts. New material → a draw function here and its name
// in SOLID_KINDS (maps/parse.ts), then list it in the biomes that offer it (theme.ts).

type DrawSolid = (ctx: CanvasRenderingContext2D, s: Rect, sky: Sky, biome: Biome) => void

export const SOLID_ART: Record<Exclude<SolidKind, 'water'> | 'rock', DrawSolid> = {
  rock: drawRock,
  concrete: drawConcrete,
  metal: drawMetal,
  hazard: drawHazard,
  panel: drawPanel,
  glass: drawGlass,
  planks: drawPlanks,
  hull: drawHull,
  stone: drawStone,
}

const BLOCK = { w: 80, h: 40 } // cast concrete blocks, staggered like brickwork
const PLATE = { h: 30, rivet: 20 } // steel plates, riveted along the seams
const STRIPE = 14 // hazard stripe width
const PANEL = 48 // cream wall panels
const TRIM_EVERY_ROWS = 4 // panel rows per orange trim band
const PANE = 32 // glass block size
const BOARD = 12 // plank height
const HULL_PLATE = { w: 90, h: 36 }
const COURSE = 36 // temple stone: row height
const STONE_WIDTHS = [72, 48, 96, 60] // cut stones, cycling; each row starts further along

// Water is skipped: the sea is drawn last by createScenery().water(), over everything it reflects.
export function drawSolid(ctx: CanvasRenderingContext2D, solid: PlacedSolid, sky: Sky, biome: Biome) {
  if (solid.kind === 'water') return
  const draw = SOLID_ART[solid.kind ?? 'rock']
  if (!draw) throw new Error(`drawSolid: unknown solid kind "${solid.kind}"`)
  if (!solid.kind && solid.shape) drawLitRock(ctx, solid, sky, biome)
  else if (solid.shape) drawShaped(ctx, solid, solid.shape, () => draw(ctx, solid, sky, biome))
  else if (solid.angle) turnedAbout(ctx, solid, solid.angle, () => draw(ctx, solid, sky, biome))
  else draw(ctx, solid, sky, biome)
}

export function drawRock(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky, biome: Biome) {
  const draw = GROUND_ART[biome]
  if (!draw) throw new Error(`drawRock: unknown biome "${biome}", expected one of ${Object.keys(GROUND_ART)}`)
  draw(ctx, solid, sky.ground[biome])
}

// Horizontal boards with nails at the ends; tiki bar or harbour pier.
function drawPlanks(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  const [light, mid, dark] = sky.wood
  clipped(ctx, solid, () => {
    for (let i = 0, y = solid.y; y < solid.y + solid.h; i++, y += BOARD) {
      const g = ctx.createLinearGradient(0, y, 0, y + BOARD)
      g.addColorStop(0, light)
      g.addColorStop(0.4, mid)
      g.addColorStop(1, dark)
      ctx.fillStyle = g
      ctx.fillRect(solid.x, y, solid.w, BOARD)
      ctx.fillStyle = COLOR.seam
      ctx.fillRect(solid.x, y + BOARD - 1, solid.w, 1)
      const grain = solid.x + 20 + ((i * 47) % Math.max(1, solid.w - 40))
      ctx.fillRect(grain, y + 3, Math.min(30, solid.x + solid.w - grain), 1)
    }
    rivets(ctx, solid.y + BOARD / 2, { x0: solid.x + 5, x1: solid.x + solid.w, step: Math.max(10, solid.w - 10) })
    rivets(ctx, solid.y + solid.h - BOARD / 2, {
      x0: solid.x + 5,
      x1: solid.x + solid.w,
      step: Math.max(10, solid.w - 10),
    })
  })
  edges(ctx, solid, COLOR.lip)
}

// Big riveted hull plates with rust streaking down from the rivets.
function drawHull(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  const [light, mid, shadow] = sky.metal
  vertical(ctx, solid, [light, mid, shadow], solid.h / 2)
  clipped(ctx, solid, () => {
    for (let row = 0, y = solid.y; y < solid.y + solid.h; row++, y += HULL_PLATE.h) {
      if (row) seam(ctx, { x: solid.x, y, w: solid.w, h: 2 })
      const offset = row % 2 ? HULL_PLATE.w / 2 : 0
      for (let x = solid.x + offset; x < solid.x + solid.w; x += HULL_PLATE.w) {
        if (x > solid.x) seam(ctx, { x, y, w: 2, h: HULL_PLATE.h })
        ctx.fillStyle = COLOR.rust
        ctx.fillRect(x + 6, y + 8, 2, 10 + ((x * 3) % 14))
      }
      rivets(ctx, y + 6, { x0: solid.x + 8, x1: solid.x + solid.w, step: 16 })
    }
  })
  edges(ctx, solid, light)
}

function drawConcrete(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  vertical(ctx, solid, sky.concrete, 30)
  clipped(ctx, solid, () => {
    for (let row = 0, y = solid.y; y < solid.y + solid.h; row++, y += BLOCK.h) {
      if (row) seam(ctx, { x: solid.x, y, w: solid.w, h: 2 })
      for (let x = solid.x + (row % 2 ? BLOCK.w / 2 : BLOCK.w); x < solid.x + solid.w; x += BLOCK.w) {
        seam(ctx, { x, y, w: 2, h: BLOCK.h })
      }
    }
  })
  edges(ctx, solid, COLOR.lip)
}

function drawMetal(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  const [light, mid, shadow] = sky.metal
  clipped(ctx, solid, () => {
    for (let y = solid.y; y < solid.y + solid.h; y += PLATE.h) {
      const g = ctx.createLinearGradient(0, y, 0, y + PLATE.h)
      g.addColorStop(0, light)
      g.addColorStop(0.35, mid)
      g.addColorStop(1, shadow)
      ctx.fillStyle = g
      ctx.fillRect(solid.x, y, solid.w, PLATE.h)
      if (y > solid.y) {
        seam(ctx, { x: solid.x, y, w: solid.w, h: 2 })
        rivets(ctx, y + 7, { x0: solid.x + PLATE.rivet / 2, x1: solid.x + solid.w, step: PLATE.rivet })
      }
    }
  })
  edges(ctx, solid, light)
}

// Mustard with dark diagonal stripes: mark edges that bite.
function drawHazard(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  ctx.fillStyle = COLOR.hazard
  ctx.fillRect(solid.x, solid.y, solid.w, solid.h)
  clipped(ctx, solid, () => {
    ctx.fillStyle = sky.metal[2]
    for (let x = solid.x - solid.h; x < solid.x + solid.w; x += STRIPE * 2) {
      ctx.beginPath()
      ctx.moveTo(x, solid.y + solid.h)
      ctx.lineTo(x + STRIPE, solid.y + solid.h)
      ctx.lineTo(x + STRIPE + solid.h, solid.y)
      ctx.lineTo(x + solid.h, solid.y)
      ctx.fill()
    }
  })
  const shade = ctx.createLinearGradient(0, solid.y, 0, solid.y + solid.h)
  shade.addColorStop(0, 'rgba(255,255,255,0.15)')
  shade.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = shade
  ctx.fillRect(solid.x, solid.y, solid.w, solid.h)
  edges(ctx, solid, COLOR.lip)
}

// Cream wall panels with corner rivets and an orange trim band every few rows.
function drawPanel(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  const [light, base, shade] = sky.panel
  vertical(ctx, solid, [light, base, shade], solid.h / 2)
  clipped(ctx, solid, () => {
    for (let row = 0, y = solid.y; y < solid.y + solid.h; row++, y += PANEL) {
      for (let x = solid.x; x < solid.x + solid.w; x += PANEL) {
        ctx.fillStyle = shade
        ctx.fillRect(x + PANEL - 1, y, 1, PANEL)
        ctx.fillRect(x, y + PANEL - 1, PANEL, 1)
        ctx.fillStyle = COLOR.seamLit
        ctx.fillRect(x, y, PANEL, 1)
        ctx.fillRect(x, y, 1, PANEL)
      }
      rivets(ctx, y + 5, { x0: solid.x + 5, x1: solid.x + solid.w, step: PANEL })
      rivets(ctx, y + PANEL - 6, { x0: solid.x + 5, x1: solid.x + solid.w, step: PANEL })
      if (row % TRIM_EVERY_ROWS === TRIM_EVERY_ROWS - 1) {
        ctx.fillStyle = COLOR.trim
        ctx.fillRect(solid.x, y + PANEL - 8, solid.w, 6)
      }
    }
  })
  edges(ctx, solid, COLOR.lip)
}

// Glass blocks in a gunmetal frame, stretched a little so only whole panes fit; some light up after dark.
function drawGlass(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  const [top, bottom] = sky.glass
  const cols = Math.max(1, Math.round(solid.w / PANE))
  const rows = Math.max(1, Math.round(solid.h / PANE))
  const pw = solid.w / cols
  const ph = solid.h / rows
  ctx.fillStyle = sky.metal[1]
  ctx.fillRect(solid.x, solid.y, solid.w, solid.h)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = solid.x + col * pw
      const y = solid.y + row * ph
      const g = ctx.createLinearGradient(0, y, 0, y + ph)
      g.addColorStop(0, top)
      g.addColorStop(1, bottom)
      ctx.fillStyle = g
      ctx.fillRect(x + 3, y + 3, pw - 6, ph - 6)
      if (sky.windows && (col * 7 + row * 13) % 5 === 0) {
        ctx.fillStyle = COLOR.windowLight
        ctx.globalAlpha = 0.45
        ctx.fillRect(x + 3, y + 3, pw - 6, ph - 6)
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = COLOR.gloss
      ctx.fillRect(x + 5, y + 5, Math.max(0, pw - 14), 2)
      ctx.fillRect(x + 5, y + 5, 2, Math.max(0, ph - 14))
    }
  }
  edges(ctx, solid, sky.metal[0])
}

// Ancient temple wall: big cut stones, a carved band every third course, moss creeping out of the joints.
function drawStone(ctx: CanvasRenderingContext2D, solid: Rect, sky: Sky) {
  vertical(ctx, solid, sky.stone, 30)
  clipped(ctx, solid, () => {
    for (let row = 0, y = solid.y; y < solid.y + solid.h; row++, y += COURSE) {
      if (row) seam(ctx, { x: solid.x, y, w: solid.w, h: 2 })
      let x = solid.x - ((row * 37) % 60)
      for (let i = row; x < solid.x + solid.w; i++) {
        const w = STONE_WIDTHS[i % STONE_WIDTHS.length]
        if (x > solid.x) seam(ctx, { x, y, w: 2, h: COURSE })
        if (row % 3 === 1) carving(ctx, { x: x + 2, y: y + 2, w: w - 2, h: COURSE - 2 })
        if ((i * 5 + row * 3) % 4 === 0) moss(ctx, x + 2, y + COURSE)
        x += w
      }
    }
  })
  edges(ctx, solid, COLOR.lip)
  ctx.fillStyle = COLOR.moss
  for (let x = solid.x + 8; x < solid.x + solid.w - 8; x += 23) ctx.fillRect(x, solid.y, 5 + (x % 7), 3 + (x % 3))
}

// Stepped-fret motif cut into a stone: two nested outlines and a sunken center.
function carving(ctx: CanvasRenderingContext2D, { x, y, w, h }: Rect) {
  ctx.strokeStyle = COLOR.seam
  ctx.lineWidth = 1.5
  ctx.strokeRect(x + 7, y + 8, w - 14, h - 16)
  ctx.strokeRect(x + 12, y + 12, w - 24, h - 24)
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x + w / 2 - 2, y + h / 2 - 2, 4, 4)
}

// A tuft hanging out of a joint at x, y.
function moss(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = COLOR.moss
  ctx.beginPath()
  ctx.ellipse(x + 2, y, 7, 3.5, 0, 0, TAU)
  ctx.ellipse(x + 5, y + 5, 2.5, 5, 0, 0, TAU)
  ctx.fill()
}

// Lit top lip, softly shaded right edge: light comes from the upper left everywhere.
function edges(ctx: CanvasRenderingContext2D, solid: Rect, lip: string) {
  const shade = ctx.createLinearGradient(solid.x + solid.w - 6, 0, solid.x + solid.w, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, COLOR.edgeShade)
  ctx.fillStyle = shade
  ctx.fillRect(solid.x + solid.w - 6, solid.y, 6, solid.h)
  ctx.fillStyle = lip
  ctx.fillRect(solid.x, solid.y, solid.w, 3)
}

function clipped(ctx: CanvasRenderingContext2D, { x, y, w, h }: Rect, draw: () => void) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  draw()
  ctx.restore()
}

// Dark joint with a lit edge below / right of it, so it reads as a groove.
function seam(ctx: CanvasRenderingContext2D, { x, y, w, h }: Rect) {
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = COLOR.seamLit
  if (w > h) ctx.fillRect(x, y + h, w, 1)
  else ctx.fillRect(x + w, y, 1, h)
}

// A row of rivet heads from x0 to x1, one path so it's cheap on big walls.
function rivets(ctx: CanvasRenderingContext2D, y: number, { x0, x1, step }: { x0: number; x1: number; step: number }) {
  for (const [dx, dy, color] of [[0.5, 0.5, COLOR.rivetDark], [0, 0, COLOR.seamLit]] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    for (let x = x0; x < x1; x += step) {
      ctx.moveTo(x + dx, y + dy)
      ctx.arc(x + dx, y + dy, 1.6, 0, TAU)
    }
    ctx.fill()
  }
}
