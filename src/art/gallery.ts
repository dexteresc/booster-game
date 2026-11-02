import { config } from '../config.ts'
import { DEFAULT_MAP, maps } from '../maps/index.ts'
import { BIOMES, COLOR, FONT, SKIES } from './theme.ts'
import { createScenery, drawFlag, drawFlagPin, drawPad, randomWeather } from './scenery.ts'
import { drawRock, drawSolid } from './solids.ts'
import { drawProp } from './props/index.ts'
import { drawCannon, drawLaser, drawRocket } from './sprites.ts'
import { createEffects } from './effects.ts'
import { createTrails } from './trail.ts'
import { DEFAULT_SKIN } from './skins.ts'
import { fitCanvas } from './brush.ts'
import { context2d, find } from '../dom.ts'
import { teamEntries } from '../sim/game.ts'
import type { Explosion } from './effects.ts'
import type { Skin } from './skins.ts'
import type { Time } from './theme.ts'
import type { Biome, Team } from '../maps/parse.ts'

// Art preview: every sprite on one screen, animated, over the real scenery.
// `npm run dev`, open /art.html; edits in src/art/ reload instantly.
// New sprite → add a cell here. Keys: T cycles time of day, R toggles rain, B cycles biome.

const CELL = 100 // world units

type Shed = (rocket: Parameters<ReturnType<typeof createTrails>['shed']>[0]) => void
const ZOOM = 3

type Cell = [
  label: string,
  draw: (
    ctx: CanvasRenderingContext2D,
    frame: { x: number; y: number; t: number; boom: (e: Explosion) => void; shed: Shed },
  ) => void,
]

type Pose = { left?: boolean; right?: boolean; angle?: number; skin?: Skin }
const rocket = (x: number, y: number, team: Team, pose: Pose = {}) => {
  const { left = false, right = false, angle = 0, skin = DEFAULT_SKIN } = pose
  return { x, y, team, angle, input: { left, right }, skin }
}
const BOTH = { left: true, right: true }
// One skinned rocket per trail, to see them side by side.
const SKINNED: Skin[] = [
  { body: 'needle', paint: 'cherry', flame: 'azure', trail: 'rainbow' },
  { body: 'bulb', paint: 'gold', flame: 'violet', trail: 'glitter' },
  { body: 'fin', paint: 'mint', flame: 'pink', trail: 'petals' },
  { body: 'classic', paint: 'jet', flame: 'white', trail: 'ash' },
]
let canyon = maps[DEFAULT_MAP]

// Each cell draws around its center x, y. t: clock, boom: throttled explosion.
const cells: Cell[] = [
  ['rocket idle', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y, 'blue'), config.rocket.engineOffset)],
  ['both engines', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y - 10, 'blue', BOTH), config.rocket.engineOffset)],
  ['turning', (ctx, { x, y, t }) => drawRocket(ctx, rocket(x, y - 10, 'blue', { left: true, angle: Math.sin(t) * 0.5 }), config.rocket.engineOffset)],
  ['red team', (ctx, { x, y }) => drawRocket(ctx, rocket(x, y - 10, 'red', BOTH), config.rocket.engineOffset)],
  ...SKINNED.map((skin): Cell => [`${skin.body} · ${skin.paint} · ${skin.trail}`, (ctx, { x, y, t, shed }) => {
    const skinned = rocket(x, y - 25, 'blue', { ...BOTH, angle: Math.sin(t) * 0.3, skin })
    shed(skinned)
    drawRocket(ctx, skinned, config.rocket.engineOffset)
  }]),
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
  ['objective pin', (ctx, { x, y, t }) => drawFlagPin(ctx, { x, y, angle: t }, 'red', t)],
  ['pad + rock', (ctx, { x, y, t }) => {
    drawRock(ctx, { x: x - 45, y: y + 20, w: 90, h: 25 }, scenery.sky, canyon.biome)
    drawPad(ctx, { x: x - 35, y, w: 70, h: 20 }, 'blue', t)
  }],
  ...(['concrete', 'metal', 'hazard', 'panel', 'glass', 'planks', 'hull', 'stone'] as const).map((kind): Cell => [kind, (ctx, { x, y }) => {
    drawSolid(ctx, { x: x - 45, y: y - 10, w: 90, h: 50, kind }, scenery.sky, canyon.biome)
    drawSolid(ctx, { x: x - 20, y: y - 40, w: 40, h: 30, kind }, scenery.sky, canyon.biome)
  }]),
  ...(['lamp', 'starburst', 'beacon', 'tank', 'radar', 'saucer', 'palm', 'statue'] as const).map((kind): Cell => [kind, (ctx, { x, y, t }) => {
    drawRock(ctx, { x: x - 45, y: y + 35, w: 90, h: 12 }, scenery.sky, canyon.biome)
    drawProp(ctx, { kind, x, y: y + 35 }, t)
  }]),
  ['flipped', (ctx, { x, y, t }) => {
    drawRock(ctx, { x: x - 45, y: y + 35, w: 90, h: 12 }, scenery.sky, canyon.biome)
    drawProp(ctx, { kind: 'statue', x: x - 22, y: y + 35, flip: true }, t)
    drawProp(ctx, { kind: 'lamp', x: x + 30, y: y + 35, flip: true }, t)
  }],
  ['explosion', (ctx, { x, y, boom }) => boom({ x, y, team: 'blue' })],
]

const canvas = find<HTMLCanvasElement>(document, 'canvas')
const ctx = context2d(canvas)
let scenery = createScenery(canyon, randomWeather(canyon.biome))
addEventListener('keydown', (e) => {
  const { time, rain } = scenery.weather
  const times = Object.keys(SKIES) as Time[]
  const biomes = Object.keys(BIOMES) as Biome[]
  if (e.code === 'KeyT') scenery = createScenery(canyon, { time: times[(times.indexOf(time) + 1) % times.length], rain })
  if (e.code === 'KeyR') scenery = createScenery(canyon, { time, rain: !rain })
  if (e.code === 'KeyB') {
    canyon = { ...canyon, biome: biomes[(biomes.indexOf(canyon.biome) + 1) % biomes.length] }
    scenery = createScenery(canyon, { time, rain })
  }
})
const effects = createEffects()
const trails = createTrails()
let clock = 0
let nextBoom = 0
let last = performance.now()

requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now
  clock += dt
  const { dpr, w, h } = fitCanvas(canvas)
  drawMap(w, h)
  drawCells(w, dpr, dt)
  effects.draw(ctx, dt)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  scenery.rain(ctx, 0, 0, clock)
  drawKeysHint(h, dpr)
  requestAnimationFrame(frame)
})

// Whole map scaled to fill the screen
function drawMap(w: number, h: number) {
  const fit = Math.max(w / canyon.width, h / canyon.height)
  ctx.setTransform(fit, 0, 0, fit, 0, 0)
  scenery.backdrop(ctx, canyon.width / 2, canyon.height / 2, clock)
  for (const s of canyon.solids) drawSolid(ctx, s, scenery.sky, canyon.biome)
  for (const [team, base] of teamEntries(canyon.bases)) drawPad(ctx, base.pad, team, clock)
  for (const p of canyon.props) drawProp(ctx, p, clock)
  scenery.water(ctx, canyon.width / 2, clock)
}

function drawCells(w: number, dpr: number, dt: number) {
  const zoom = ZOOM * dpr
  const cols = Math.max(1, Math.floor(w / (CELL * zoom)))
  const boom = (e: Explosion) => {
    if (clock < nextBoom) return
    effects.explode(e)
    nextBoom = clock + 1.5
  }
  const shed: Shed = (shedding) => trails.shed(shedding, config.rocket.engineOffset, dt)
  ctx.setTransform(zoom, 0, 0, zoom, 0, 0)
  trails.draw(ctx, dt)
  cells.forEach(([label, draw], i) => {
    const x = (i % cols) * CELL + CELL / 2
    const y = Math.floor(i / cols) * CELL + CELL / 2
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x - CELL / 2 + 2, y - CELL / 2 + 2, CELL - 4, CELL - 4)
    draw(ctx, { x, y, t: clock, boom, shed })
    ctx.fillStyle = COLOR.textDim
    ctx.font = `600 5px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(label.toUpperCase(), x, y + CELL / 2 - 6)
  })
}

function drawKeysHint(h: number, dpr: number) {
  const { time, rain } = scenery.weather
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = COLOR.text
  ctx.font = `600 13px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(`T: ${time.toUpperCase()}   R: RAIN ${rain ? 'ON' : 'OFF'}   B: ${canyon.biome.toUpperCase()}`, 12, h / dpr - 12)
}
