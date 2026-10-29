import { flagHome } from './sim/game.js'
import { COLOR, FONT, TEAM } from './art/theme.js'
import { fitCanvas } from './art/brush.js'
import { createScenery, drawFlag, drawPad, randomWeather } from './art/scenery.js'
import { drawSolid } from './art/solids.js'
import { drawProp } from './art/props/index.js'
import { drawCannon, drawLaser, drawRocket } from './art/sprites.js'
import { createEffects } from './art/effects.js'

const MUZZLE_FLASH = 0.08 // seconds after a shot

// Render-only state (camera, particles, banners) lives here, never in the sim.
// What things look like lives in src/art/; this file decides what goes where.
export function createRenderer(canvas, config) {
  const ctx = canvas.getContext('2d')
  const view = {
    touch: matchMedia('(pointer: coarse)').matches,
    effects: createEffects(),
    scenery: null,
    sceneryFor: null, // the game it was laid out for
    banner: null,
    clock: 0,
    cam: null,
  }

  return function draw(game, localId, events, dt) {
    view.clock += dt
    const { dpr, w, h } = fitCanvas(canvas)
    applyEvents(view, events)
    if (view.sceneryFor !== game) {
      view.scenery = createScenery(game.map, randomWeather())
      view.sceneryFor = game
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = COLOR.void
    ctx.fillRect(0, 0, w, h)
    const me = game.rockets.find((r) => r.id === localId)
    if (!me) return // Joining: no rocket until the host's first snapshot.

    // One frame's worth of everything the draw steps need. cw, ch: CSS pixels.
    const frame = { ctx, game, me, config, dt, dpr, w, h, cw: w / dpr, ch: h / dpr, scale: Math.max(w, h) / config.view.size }
    frame.cam = followCamera(view, frame)
    drawWorld(frame, view)
    drawHud(frame, view)
  }
}

function applyEvents(view, events) {
  for (const e of events) {
    if (e.type === 'explode') view.effects.explode(e)
    if (e.type === 'capture') view.banner = { text: `${TEAM[e.team].label} CAPTURED THE FLAG`, until: view.clock + 2 }
  }
}

// Eases view.cam toward the local rocket; returns the center clamped to the map.
function followCamera(view, { me, game, w, h, scale, dt }) {
  view.cam ??= { x: me.x, y: me.y }
  const follow = Math.min(1, dt * 6)
  view.cam.x += (me.x - view.cam.x) * follow
  view.cam.y += (me.y - view.cam.y) * follow
  return {
    x: clamp(view.cam.x, w / scale / 2, game.map.width - w / scale / 2),
    y: clamp(view.cam.y, h / scale / 2, game.map.height - h / scale / 2),
  }
}

function drawWorld({ ctx, game, me, config, dt, w, h, scale, cam }, { scenery, effects, clock }) {
  const { map } = game
  ctx.setTransform(scale, 0, 0, scale, w / 2 - cam.x * scale, h / 2 - cam.y * scale)
  scenery.backdrop(ctx, cam.x, cam.y, clock)
  for (const s of map.solids) drawSolid(ctx, s, scenery.sky)
  for (const [team, base] of Object.entries(map.bases)) drawPad(ctx, base.pad, team, clock)
  for (const p of map.props) drawProp(ctx, p, clock)
  for (const [team, t] of Object.entries(game.teams)) {
    const carrier = game.rockets.find((r) => r.id === t.flagCarrier)
    drawFlag(ctx, carrier ? { x: carrier.x, y: carrier.y - 20 } : flagHome(map.bases[team]), team, clock)
  }
  for (const c of game.cannons) drawCannon(ctx, c, c.cooldown > config.cannon.fireInterval - MUZZLE_FLASH, clock)
  for (const b of game.bullets) drawLaser(ctx, b)
  for (const r of game.rockets) if (r.alive) drawRocket(ctx, r, config.rocket.engineOffset, r === me)
  effects.draw(ctx, dt)
  scenery.water(ctx, cam.x, clock) // last: reflects everything above it
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  scenery.rain(ctx, cam.x * scale, cam.y * scale, clock)
}

function drawHud(frame, view) {
  const { ctx, dpr } = frame
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (view.touch) drawTouchZones(frame)
  if (frame.me.alive) drawObjective(frame)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.letterSpacing = '3px'
  drawScores(frame)
  const message = hudMessage(frame, view)
  if (message) drawMessage(frame, message)
  ctx.letterSpacing = '0px'
}

function drawTouchZones({ ctx, me, cw, ch }) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  if (me.input.left) ctx.fillRect(0, 0, cw / 2, ch)
  if (me.input.right) ctx.fillRect(cw / 2, 0, cw / 2, ch)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(cw / 2 - 0.5, 0, 1, ch)
}

// Enemy flag, or your own pad while carrying theirs.
function drawObjective(frame) {
  const { game, me, cam, scale, dpr, cw, ch } = frame
  const { bases } = game.map
  const carrying = Object.values(game.teams).some((t) => t.flagCarrier === me.id)
  const enemy = Object.keys(bases).find((t) => t !== me.team)
  const goal = flagHome(bases[carrying ? me.team : enemy])
  const at = { x: (goal.x - cam.x) * (scale / dpr) + cw / 2, y: (goal.y - cam.y) * (scale / dpr) + ch / 2 }
  drawObjectiveArrow(frame, at, TEAM[me.team].accent)
}

// Edge-of-screen pointer to the objective when it's off screen. at: CSS pixels.
function drawObjectiveArrow({ ctx, cw, ch }, at, accent) {
  const margin = 28
  if (at.x > margin && at.x < cw - margin && at.y > margin && at.y < ch - margin) return
  ctx.save()
  ctx.translate(clamp(at.x, margin, cw - margin), clamp(at.y, margin, ch - margin))
  ctx.rotate(Math.atan2(at.y - ch / 2, at.x - cw / 2))
  ctx.fillStyle = COLOR.text
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(-8, -8)
  ctx.lineTo(-4, 0)
  ctx.lineTo(-8, 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function drawScores({ ctx, game, config, cw }) {
  ctx.font = `700 18px ${FONT}`
  const teams = Object.entries(game.teams)
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
  ctx.fillText(`FIRST TO ${config.rules.capturesToWin}`, cw / 2, 38)
  ctx.shadowBlur = 0
}

function hudMessage({ game, me }, { banner, clock }) {
  if (game.winner) return `${TEAM[game.winner].label} WINS`
  if (!me.alive) return `RESPAWNING IN ${Math.max(0, me.respawnAt - game.time).toFixed(1)}`
  if (banner && clock < banner.until) return banner.text
  return null
}

function drawMessage({ ctx, me, cw, ch }, message) {
  ctx.font = `700 24px ${FONT}`
  ctx.fillStyle = COLOR.text
  ctx.shadowColor = TEAM[me.team].accent
  ctx.shadowBlur = 16
  ctx.fillText(message, cw / 2, ch * 0.3)
  ctx.shadowBlur = 0
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi)
}
