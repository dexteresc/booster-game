import type { Config } from './config.ts'
import type { GameEvent, GameView, ShownRocket } from './sim/game.ts'
import type { Scenery } from './art/scenery.ts'
import type { Explosion } from './art/effects.ts'
import { context2d } from './dom.ts'
import { flagHome, flagSpot, otherTeam, teamEntries } from './sim/game.ts'
import { COLOR, FONT, TEAM } from './art/theme.ts'
import { clamp, fitCanvas } from './art/brush.ts'
import { createScenery, drawFlag, drawFlagPin, drawPad, randomWeather } from './art/scenery.ts'
import { drawSolid } from './art/solids.ts'
import { drawMinimap } from './art/minimap.ts'
import { groundLoads } from './art/ground.ts'
import { drawProp } from './art/props/index.ts'
import { drawCannon, drawLaser, drawRocket } from './art/sprites.ts'
import { createEffects } from './art/effects.ts'
import { createPost } from './art/post.ts'
import { createTrails } from './art/trail.ts'

const MUZZLE_FLASH_SECONDS = 0.08 // after a shot
const SHAKE = { strength: 16, reach: 900, decay: 7 } // explosions shake the camera: world units, distance, 1/s
const OBJECTIVE_MARGIN = 48 // CSS pixels from the screen edge to the pin's center: keeps its point on screen

type Point = { x: number; y: number }

// Render-only state that lasts between frames.
type View = {
  touch: boolean
  effects: ReturnType<typeof createEffects>
  post: ReturnType<typeof createPost>
  shake: number // world units the camera jolts by, easing off
  trails: ReturnType<typeof createTrails>
  scenery: Scenery | null
  sceneryFor: GameView | null // the game it was laid out for
  sceneryLoads: number // ground images loaded when it was laid out: rocks drawn before then lack their texture
  banner: { text: string; until: number } | null
  clock: number
  fps: number // smoothed, for the corner readout
  cam: Point | null // eased camera position, before clamping to the map
}

// One frame's worth of everything the draw steps need. w, h: device pixels. cw, ch: CSS pixels.
type Frame = {
  ctx: CanvasRenderingContext2D
  game: GameView
  me: ShownRocket
  config: Config
  settings: Settings
  scenery: Scenery
  dt: number
  dpr: number
  w: number
  h: number
  cw: number
  ch: number
  scale: number
  cam: Point
}

// Render-only state (camera, particles, banners) lives here, never in the sim.
// What things look like lives in src/art/; this file decides what goes where.
// Player options that only change how things look. Edited in place from the settings dialog.
export type Settings = { bloom: boolean; vignette: boolean; fps: boolean }

export function createRenderer(canvas: HTMLCanvasElement, config: Config, settings: Settings) {
  const ctx = context2d(canvas)
  const view: View = {
    touch: matchMedia('(pointer: coarse)').matches,
    effects: createEffects(),
    post: createPost(),
    shake: 0,
    trails: createTrails(),
    scenery: null,
    sceneryFor: null,
    sceneryLoads: 0,
    banner: null,
    clock: 0,
    fps: 0,
    cam: null,
  }

  return function draw(game: GameView, localId: string, events: GameEvent[], dt: number): void {
    view.clock += dt
    if (dt > 0) view.fps += (1 / dt - view.fps) * 0.05
    const { dpr, w, h } = fitCanvas(canvas)
    const me = game.rockets.find((r) => r.id === localId)
    applyEvents(view, events, me)
    const scenery = sceneryFor(view, game)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = COLOR.void
    ctx.fillRect(0, 0, w, h)
    if (!me) return // Joining: no rocket until the host's first snapshot.

    const layout = {
      ctx, game, me, config, settings, scenery, dt, dpr, w, h,
      cw: w / dpr,
      ch: h / dpr,
      scale: Math.max(w, h) / config.view.size,
    }
    const frame = { ...layout, cam: followCamera(view, layout) }
    drawWorld(frame, view)
    view.post(ctx, w, h, { bloom: settings.bloom ? scenery.sky.bloom : 0, vignette: settings.vignette })
    drawHud(frame, view)
  }
}

// Random layout is made once per game, and again if ground images load after it.
function sceneryFor(view: View, game: GameView): Scenery {
  if (view.sceneryFor === game && view.sceneryLoads === groundLoads() && view.scenery) return view.scenery
  const scenery = createScenery(game.map, randomWeather(game.map.biome))
  view.scenery = scenery
  view.sceneryFor = game
  view.sceneryLoads = groundLoads()
  return scenery
}

function applyEvents(view: View, events: GameEvent[], me: ShownRocket | undefined) {
  for (const e of events) {
    if (e.type === 'explode') explode(view, e, me)
    if (e.type === 'capture') view.banner = { text: `${TEAM[e.team].label} CAPTURED THE FLAG`, until: view.clock + 2 }
  }
}

// Shakes the camera, harder the closer it went off.
function explode(view: View, at: Explosion, me: ShownRocket | undefined) {
  view.effects.explode(at)
  if (!me) return
  const near = Math.max(0, 1 - Math.hypot(at.x - me.x, at.y - me.y) / SHAKE.reach)
  view.shake = Math.max(view.shake, SHAKE.strength * near)
}

// Eases view.cam toward the local rocket; returns the center clamped to the map.
function followCamera(view: View, { me, game, w, h, scale, dt }: Omit<Frame, 'cam'>): Point {
  const cam = view.cam ?? { x: me.x, y: me.y }
  view.cam = cam
  const follow = Math.min(1, dt * 6)
  cam.x += (me.x - cam.x) * follow
  cam.y += (me.y - cam.y) * follow
  view.shake *= Math.exp(-SHAKE.decay * dt)
  const jolt = () => (Math.random() * 2 - 1) * view.shake
  return {
    x: clamp(cam.x, w / scale / 2, game.map.width - w / scale / 2) + jolt(),
    y: clamp(cam.y, h / scale / 2, game.map.height - h / scale / 2) + jolt(),
  }
}

function drawWorld({ ctx, game, me, config, scenery, dt, w, h, scale, cam }: Frame, { effects, trails, clock }: View) {
  const { map } = game
  ctx.setTransform(scale, 0, 0, scale, w / 2 - cam.x * scale, h / 2 - cam.y * scale)
  scenery.backdrop(ctx, cam.x, cam.y, clock)
  for (const s of map.solids) drawSolid(ctx, s, scenery.sky, map.biome)
  for (const [team, base] of teamEntries(map.bases)) drawPad(ctx, base.pad, team, clock)
  for (const p of map.props) drawProp(ctx, p, clock)
  drawFlags(ctx, game, clock)
  for (const c of game.cannons) {
    drawCannon(ctx, c, c.cooldown > config.cannon.fireInterval - MUZZLE_FLASH_SECONDS, clock)
  }
  for (const b of game.bullets) drawLaser(ctx, b)
  for (const r of game.rockets) {
    if (r.alive) trails.shed(r, config.rocket.engineOffset, dt)
  }
  effects.draw(ctx, dt)
  trails.draw(ctx, dt) // under the rockets, so exhaust trails behind them
  for (const r of game.rockets) {
    if (r.alive) drawRocket(ctx, r, config.rocket.engineOffset, r === me)
  }
  scenery.water(ctx, cam.x, clock) // last: reflects everything above it
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  scenery.rain(ctx, cam.x * scale, cam.y * scale, clock)
}

function drawFlags(ctx: CanvasRenderingContext2D, game: GameView, clock: number) {
  for (const [team, t] of teamEntries(game.teams)) {
    if (!t.flag) continue
    drawFlag(ctx, flagSpot(game, team, t.flagCarrier), team, clock)
  }
}

function drawHud(frame: Frame, view: View) {
  const { ctx, dpr } = frame
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (view.touch) drawTouchZones(frame)
  drawMinimap(ctx, frame.game, frame.me, frame)
  if (frame.me.alive) drawObjective(frame, view.clock) // over the minimap: the pin can end up in its corner
  ctx.textAlign = 'center'
  drawNameBadges(frame)
  ctx.textBaseline = 'top'
  ctx.letterSpacing = '3px'
  drawScores(frame)
  const message = hudMessage(frame, view)
  if (message) drawMessage(frame, message)
  ctx.letterSpacing = '0px'
  if (frame.settings.fps) drawFps(frame, view.fps)
}

function drawTouchZones({ ctx, me, cw, ch }: Frame) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  if (me.input.left) ctx.fillRect(0, 0, cw / 2, ch)
  if (me.input.right) ctx.fillRect(cw / 2, 0, cw / 2, ch)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(cw / 2 - 0.5, 0, 1, ch)
}

// Edge-of-screen pointer when the goal is off screen: the enemy flag, or your own pad while carrying theirs.
function drawObjective({ ctx, game, me, cam, scale, dpr, cw, ch }: Frame, clock: number) {
  const goalTeam = Object.values(game.teams).some((t) => t.flagCarrier === me.id) ? me.team : otherTeam(me.team)
  const goal = flagHome(game.map.bases[goalTeam])
  const at = { x: (goal.x - cam.x) * (scale / dpr) + cw / 2, y: (goal.y - cam.y) * (scale / dpr) + ch / 2 }
  const margin = OBJECTIVE_MARGIN
  if (at.x > margin && at.x < cw - margin && at.y > margin && at.y < ch - margin) return
  const x = clamp(at.x, margin, cw - margin)
  const y = clamp(at.y, margin, ch - margin)
  drawFlagPin(ctx, { x, y, angle: Math.atan2(at.y - y, at.x - x) }, goalTeam, clock)
}

// Other players' names above their rockets: blue = your team, red = the other team.
function drawNameBadges({ ctx, game, me, cam, scale, dpr, cw, ch }: Frame) {
  ctx.font = `600 11px ${FONT}`
  ctx.textBaseline = 'middle'
  for (const r of game.rockets) {
    if (!r.alive || r === me || !r.name) continue
    const x = (r.x - cam.x) * (scale / dpr) + cw / 2
    const y = (r.y - 40 - cam.y) * (scale / dpr) + ch / 2 // above the antenna
    const w = ctx.measureText(r.name).width + 10
    ctx.fillStyle = r.team === me.team ? COLOR.ally : COLOR.enemy
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8)
    ctx.fill()
    ctx.fillStyle = COLOR.text
    ctx.fillText(r.name, x, y + 0.5)
  }
}

function drawScores({ ctx, game, config, cw }: Frame) {
  ctx.font = `700 18px ${FONT}`
  const teams = teamEntries(game.teams)
  teams.forEach(([team, t], i) => {
    ctx.fillStyle = TEAM[team].accent
    ctx.shadowColor = TEAM[team].accent
    ctx.shadowBlur = 10
    ctx.fillText(`${TEAM[team].label} ${t.score}`, cw / 2 + (i - (teams.length - 1) / 2) * 140, 14)
  })
  ctx.shadowColor = COLOR.textShadow // readable on the bright day sky
  ctx.shadowBlur = 4
  ctx.fillStyle = COLOR.textDim
  ctx.font = `600 11px ${FONT}`
  ctx.fillText(goalText(game, config.rules), cw / 2, 38)
  ctx.shadowBlur = 0
}

function goalText(game: GameView, rules: Config['rules']) {
  if (game.mode === 'pvp') return `FIRST TO ${rules.capturesToWin}`
  return `${rules.capturesToWin} CAPTURES WIN · ${rules.cpuKillsToWin} SHOOT-DOWNS LOSE`
}

function hudMessage({ game, me }: Frame, { banner, clock }: View) {
  if (game.winner) return `${TEAM[game.winner].label} WINS`
  if (!me.alive) return `RESPAWNING IN ${Math.max(0, me.respawnAt - game.time).toFixed(1)}`
  if (banner && clock < banner.until) return banner.text
  return null
}

function drawMessage({ ctx, me, cw, ch }: Frame, message: string) {
  ctx.font = `700 24px ${FONT}`
  ctx.fillStyle = COLOR.text
  ctx.shadowColor = TEAM[me.team].accent
  ctx.shadowBlur = 16
  ctx.fillText(message, cw / 2, ch * 0.3)
  ctx.shadowBlur = 0
}

// Bottom right corner, for checking performance while playing.
function drawFps({ ctx, cw, ch }: Frame, fps: number) {
  ctx.font = `600 12px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = fps < 50 ? COLOR.enemy : COLOR.textDim
  ctx.fillText(`${fps.toFixed(0)} FPS`, cw - 10, ch - 8)
}
