import type { Rect } from '../maps/parse.ts'
import type { GameView, ShownRocket } from '../sim/game.ts'
import type { PlacedSolid } from '../sim/geometry.ts'
import type { Point } from './brush.ts'
import { flagSpot, teamEntries } from '../sim/game.ts'
import { COLOR, TEAM } from './theme.ts'
import { turnedAbout } from './brush.ts'
import { outlinePath } from './shapes.ts'

// HUD minimap: the whole map in a corner. Drawn in CSS pixels.

const MINIMAP_SIZE = 240 // CSS pixels along the map's longest edge, less on small screens
const MINIMAP_MARGIN = 12
const SCORES_BOTTOM = 56 // CSS pixels: narrow screens put the minimap under the scores
const WIDE_SCREEN = 900 // CSS pixels: the minimap fits beside the scores from here up

type Screen = { cw: number; ch: number }
type Shown = { game: GameView; me: ShownRocket }

// The whole map in a corner: terrain, pads, flags and rockets.
export function drawMinimap(ctx: CanvasRenderingContext2D, game: GameView, me: ShownRocket, { cw, ch }: Screen) {
  const { map } = game
  const zoom = Math.min(MINIMAP_SIZE, Math.min(cw, ch) * 0.4) / Math.max(map.width, map.height)
  const left = MINIMAP_MARGIN
  const top = cw >= WIDE_SCREEN ? MINIMAP_MARGIN : SCORES_BOTTOM
  const toMinimap = ({ x, y }: Point) => ({ x: left + x * zoom, y: top + y * zoom })
  const fillRect = (r: Rect, color: string) => {
    const at = toMinimap(r)
    ctx.fillStyle = color
    ctx.fillRect(at.x, at.y, r.w * zoom, r.h * zoom)
  }

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(left, top, map.width * zoom, map.height * zoom, 4)
  ctx.fillStyle = COLOR.minimapBack
  ctx.fill()
  ctx.clip() // solids and rockets can reach past the map's edge
  drawSolids(ctx, map.solids, { x: left, y: top }, zoom)
  for (const [team, { pad }] of teamEntries(map.bases)) fillRect(pad, TEAM[team].accent)
  drawMarkers(ctx, { game, me }, toMinimap)
  ctx.restore()
}

// In their shapes, turned as far as they've spun.
function drawSolids(ctx: CanvasRenderingContext2D, solids: PlacedSolid[], corner: Point, zoom: number) {
  ctx.save()
  ctx.translate(corner.x, corner.y)
  ctx.scale(zoom, zoom)
  for (const s of solids) {
    ctx.fillStyle = s.kind === 'water' ? COLOR.teal : COLOR.minimapSolid
    turnedAbout(ctx, s, s.angle ?? 0, () => ctx.fill(outlinePath(s)))
  }
  ctx.restore()
}

function drawMarkers(ctx: CanvasRenderingContext2D, { game, me }: Shown, toMinimap: (p: Point) => Point) {
  for (const [team, t] of teamEntries(game.teams)) {
    if (t.flag) drawFlagMark(ctx, toMinimap(flagSpot(game, team, t.flagCarrier)), TEAM[team].accent)
  }
  for (const r of game.rockets) {
    if (r.alive && r !== me) drawDot(ctx, toMinimap(r), 2.5, r.team === me.team ? COLOR.ally : COLOR.enemy)
  }
  if (me.alive) drawDot(ctx, toMinimap(me), 3.5, COLOR.meOutline) // last: never hidden
}

function drawFlagMark(ctx: CanvasRenderingContext2D, foot: Point, color: string) {
  ctx.fillStyle = COLOR.meOutline
  ctx.fillRect(foot.x - 0.5, foot.y - 12, 1, 12)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(foot.x + 0.5, foot.y - 12)
  ctx.lineTo(foot.x + 8, foot.y - 9)
  ctx.lineTo(foot.x + 0.5, foot.y - 6)
  ctx.fill()
}

function drawDot(ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.fill()
}
