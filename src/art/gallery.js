import { config } from '../config.js'
import { canyon } from '../maps/canyon.js'
import { COLOR, FONT, SKIES } from './theme.js'
import { createScenery, drawFlag, drawPad, drawRock, randomWeather } from './scenery.js'
import { drawCannon, drawLaser, drawRocket } from './sprites.js'
import { createEffects } from './effects.js'
import { fitCanvas } from './brush.js'

// Art preview: every sprite on one screen, animated, over the real scenery.
// `npm run dev`, open /art.html; edits in src/art/ reload instantly.
// New sprite → add a cell here. Keys: T cycles time of day, R toggles rain.

const CELL = 100 // world units
const ZOOM = 3

const rocket = (x, y, team, { left = false, right = false, angle = 0 } = {}) => ({ x, y, team, angle, input: { left, right } })
const BOTH = { left: true, right: true }

// Each cell draws around its center x, y. t: clock, boom: throttled explosion.
const cells = [
  ['rocket idle', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y, 'blue'), config.rocket.engineOffset)],
  ['both engines', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y - 10, 'blue', BOTH), config.rocket.engineOffset)],
  ['turning', (ctx, { x, y, t }) => drawRocket(ctx, rocket(x, y - 10, 'blue', { left: true, angle: Math.sin(t) * 0.5 }), config.rocket.engineOffset)],
  ['red team', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y - 10, 'red', BOTH), config.rocket.engineOffset)],
  ['cannon', (ctx, { x, y, t }) => drawCannon(ctx, { x, y: y + 25, team: 'red', aim: -1.2 + Math.sin(t) * 0.6 }, t % 1.2 < 0.08, t)],
  ['lasers', (ctx, { x, y, t }) => {
    const dx = ((t * 120) % 80) - 40
    drawLaser(ctx, { x: x + dx, y: y - 15, vx: 350, vy: 0, team: 'red' })
    drawLaser(ctx, { x: x + dx, y: y + 15, vx: 350, vy: 0, team: 'blue' })
  }],
  ['flags', (ctx, { x, y, t }) => {
    drawFlag(ctx, { x: x - 20, y: y + 25 }, 'blue', t)
    drawFlag(ctx, { x: x + 10, y: y + 25 }, 'red', t)
  }],
  ['pad + rock', (ctx, { x, y, t }) => {
    drawRock(ctx, { x: x - 45, y: y + 20, w: 90, h: 25 }, scenery.sky)
    drawPad(ctx, { x: x - 35, y: y, w: 70, h: 20 }, 'blue', t)
  }],
  ['explosion', (ctx, { x, y, boom }) => boom({ x, y, team: 'blue' })],
]

const canvas = document.querySelector('canvas')
const ctx = canvas.getContext('2d')
let scenery = createScenery(canyon, randomWeather())
addEventListener('keydown', (e) => {
  const { time, rain } = scenery.weather
  const times = Object.keys(SKIES)
  if (e.code === 'KeyT') scenery = createScenery(canyon, { time: times[(times.indexOf(time) + 1) % times.length], rain })
  if (e.code === 'KeyR') scenery = createScenery(canyon, { time, rain: !rain })
})
const effects = createEffects()
let clock = 0
let nextBoom = 0
let last = performance.now()

requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  clock += dt
  const { dpr, w, h } = fitCanvas(canvas)
  drawMap(w, h)
  drawCells(w, dpr)
  effects.draw(ctx, dt)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  scenery.rain(ctx, 0, 0, clock)
  drawKeysHint(h, dpr)
  requestAnimationFrame(frame)
})

// Whole map scaled to fill the screen
function drawMap(w, h) {
  const fit = Math.max(w / canyon.width, h / canyon.height)
  ctx.setTransform(fit, 0, 0, fit, 0, 0)
  scenery.backdrop(ctx, canyon.width / 2, canyon.height / 2, clock)
  for (const s of canyon.solids) if (!s.water) drawRock(ctx, s, scenery.sky)
  for (const [team, base] of Object.entries(canyon.bases)) drawPad(ctx, base.pad, team, clock)
  scenery.water(ctx, canyon.width / 2, clock)
}

function drawCells(w, dpr) {
  const zoom = ZOOM * dpr
  const cols = Math.max(1, Math.floor(w / (CELL * zoom)))
  const boom = (e) => {
    if (clock < nextBoom) return
    effects.explode(e)
    nextBoom = clock + 1.5
  }
  ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
  cells.forEach(([label, draw], i) => {
    const x = (i % cols) * CELL + CELL / 2
    const y = Math.floor(i / cols) * CELL + CELL / 2
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x - CELL / 2 + 2, y - CELL / 2 + 2, CELL - 4, CELL - 4)
    draw(ctx, { x, y, t: clock, boom })
    ctx.fillStyle = COLOR.textDim
    ctx.font = `600 5px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(label.toUpperCase(), x, y + CELL / 2 - 6)
  })
}

function drawKeysHint(h, dpr) {
  const { time, rain } = scenery.weather
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = COLOR.text
  ctx.font = `600 13px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(`T: ${time.toUpperCase()}   R: RAIN ${rain ? 'ON' : 'OFF'}`, 12, h / dpr - 12)
}
