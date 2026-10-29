import { COLOR } from './theme.js'
import { TAU } from './brush.js'
import { GROUND_ART, vertical } from './ground.js'

// Solids: the rects rockets collide with, drawn by kind. sky: palette from SKIES,
// so everything is lit to match the time of day. Rock looks like the biome's ground
// (ground.js); water is in sea.js. New material → a draw function here and its name
// in SOLID_KINDS (maps/parse.js), then list it in the biomes that offer it (theme.js).

export const SOLID_ART = {
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
const TRIM_EVERY = 4 // panel rows per orange trim band
const PANE = 32 // glass block size
const BOARD = 12 // plank height
const HULL_PLATE = { w: 90, h: 36 }
const COURSE = 36 // temple stone: row height
const STONE_WIDTHS = [72, 48, 96, 60] // cut stones, cycling; each row starts further along

// Water is skipped: the sea is drawn last by createScenery().water(), over everything it reflects.
export function drawSolid(ctx, s, sky, biome) {
  if (s.kind === 'water') return
  const draw = SOLID_ART[s.kind ?? 'rock']
  if (!draw) throw new Error(`drawSolid: unknown solid kind "${s.kind}"`)
  draw(ctx, s, sky, biome)
}

export function drawRock(ctx, s, sky, biome) {
  const draw = GROUND_ART[biome]
  if (!draw) throw new Error(`drawRock: unknown biome "${biome}", expected one of ${Object.keys(GROUND_ART)}`)
  draw(ctx, s, sky.ground[biome])
}

// Horizontal boards with nails at the ends; tiki bar or harbour pier.
function drawPlanks(ctx, s, sky) {
  const [light, mid, dark] = sky.wood
  clipped(ctx, s, () => {
    for (let i = 0, y = s.y; y < s.y + s.h; i++, y += BOARD) {
      const g = ctx.createLinearGradient(0, y, 0, y + BOARD)
      g.addColorStop(0, light)
      g.addColorStop(0.4, mid)
      g.addColorStop(1, dark)
      ctx.fillStyle = g
      ctx.fillRect(s.x, y, s.w, BOARD)
      ctx.fillStyle = COLOR.seam
      ctx.fillRect(s.x, y + BOARD - 1, s.w, 1)
      const grain = s.x + 20 + ((i * 47) % Math.max(1, s.w - 40))
      ctx.fillRect(grain, y + 3, Math.min(30, s.x + s.w - grain), 1)
    }
    rivets(ctx, s.y + BOARD / 2, { x0: s.x + 5, x1: s.x + s.w, step: Math.max(10, s.w - 10) })
    rivets(ctx, s.y + s.h - BOARD / 2, { x0: s.x + 5, x1: s.x + s.w, step: Math.max(10, s.w - 10) })
  })
  edges(ctx, s, COLOR.lip)
}

// Big riveted hull plates with rust streaking down from the rivets.
function drawHull(ctx, s, sky) {
  const [light, mid, shadow] = sky.metal
  vertical(ctx, s, [light, mid, shadow], s.h / 2)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += HULL_PLATE.h) {
      if (row) seam(ctx, { x: s.x, y, w: s.w, h: 2 })
      const offset = row % 2 ? HULL_PLATE.w / 2 : 0
      for (let x = s.x + offset; x < s.x + s.w; x += HULL_PLATE.w) {
        if (x > s.x) seam(ctx, { x, y, w: 2, h: HULL_PLATE.h })
        ctx.fillStyle = COLOR.rust
        ctx.fillRect(x + 6, y + 8, 2, 10 + ((x * 3) % 14))
      }
      rivets(ctx, y + 6, { x0: s.x + 8, x1: s.x + s.w, step: 16 })
    }
  })
  edges(ctx, s, light)
}

function drawConcrete(ctx, s, sky) {
  vertical(ctx, s, sky.concrete, 30)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += BLOCK.h) {
      if (row) seam(ctx, { x: s.x, y, w: s.w, h: 2 })
      for (let x = s.x + (row % 2 ? BLOCK.w / 2 : BLOCK.w); x < s.x + s.w; x += BLOCK.w) seam(ctx, { x, y, w: 2, h: BLOCK.h })
    }
  })
  edges(ctx, s, COLOR.lip)
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
  edges(ctx, s, light)
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
  edges(ctx, s, COLOR.lip)
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
  edges(ctx, s, COLOR.lip)
}

// Glass blocks in a gunmetal frame, stretched a little so only whole panes fit; some light up after dark.
function drawGlass(ctx, s, sky) {
  const [top, bottom] = sky.glass
  const cols = Math.max(1, Math.round(s.w / PANE))
  const rows = Math.max(1, Math.round(s.h / PANE))
  const pw = s.w / cols
  const ph = s.h / rows
  ctx.fillStyle = sky.metal[1]
  ctx.fillRect(s.x, s.y, s.w, s.h)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = s.x + col * pw
      const y = s.y + row * ph
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
  edges(ctx, s, sky.metal[0])
}

// Ancient temple wall: big cut stones, a carved band every third course, moss creeping out of the joints.
function drawStone(ctx, s, sky) {
  vertical(ctx, s, sky.stone, 30)
  clipped(ctx, s, () => {
    for (let row = 0, y = s.y; y < s.y + s.h; row++, y += COURSE) {
      if (row) seam(ctx, { x: s.x, y, w: s.w, h: 2 })
      let x = s.x - ((row * 37) % 60)
      for (let i = row; x < s.x + s.w; i++) {
        const w = STONE_WIDTHS[i % STONE_WIDTHS.length]
        if (x > s.x) seam(ctx, { x, y, w: 2, h: COURSE })
        if (row % 3 === 1) carving(ctx, { x: x + 2, y: y + 2, w: w - 2, h: COURSE - 2 })
        if ((i * 5 + row * 3) % 4 === 0) moss(ctx, x + 2, y + COURSE)
        x += w
      }
    }
  })
  edges(ctx, s, COLOR.lip)
  ctx.fillStyle = COLOR.moss
  for (let x = s.x + 8; x < s.x + s.w - 8; x += 23) ctx.fillRect(x, s.y, 5 + (x % 7), 3 + (x % 3))
}

// Stepped-fret motif cut into a stone: two nested outlines and a sunken center.
function carving(ctx, { x, y, w, h }) {
  ctx.strokeStyle = COLOR.seam
  ctx.lineWidth = 1.5
  ctx.strokeRect(x + 7, y + 8, w - 14, h - 16)
  ctx.strokeRect(x + 12, y + 12, w - 24, h - 24)
  ctx.fillStyle = COLOR.seam
  ctx.fillRect(x + w / 2 - 2, y + h / 2 - 2, 4, 4)
}

// A tuft hanging out of a joint at x, y.
function moss(ctx, x, y) {
  ctx.fillStyle = COLOR.moss
  ctx.beginPath()
  ctx.ellipse(x + 2, y, 7, 3.5, 0, 0, TAU)
  ctx.ellipse(x + 5, y + 5, 2.5, 5, 0, 0, TAU)
  ctx.fill()
}

// Lit top lip, softly shaded right edge: light comes from the upper left everywhere.
function edges(ctx, s, lip) {
  const shade = ctx.createLinearGradient(s.x + s.w - 6, 0, s.x + s.w, 0)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, COLOR.edgeShade)
  ctx.fillStyle = shade
  ctx.fillRect(s.x + s.w - 6, s.y, 6, s.h)
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
