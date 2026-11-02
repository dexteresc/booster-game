import assert from 'node:assert/strict'
import type { Config } from '../src/config.ts'
import type { GameMap, Mode, Solid } from '../src/maps/parse.ts'
import type { Input } from '../src/sim/rocket.ts'
import { config as baseConfig } from '../src/config.ts'
import { addPlayer, createGame, flagHome, maxPlayersPerTeam, removePlayer, step } from '../src/sim/game.ts'
import { solidAt, surfaceAt } from '../src/sim/geometry.ts'
import { DEFAULT_SKIN } from '../src/art/skins.ts'

const flat: GameMap = {
  mode: 'pve',
  biome: 'desert',
  width: 2000,
  height: 1000,
  solids: [{ x: 0, y: 900, w: 2000, h: 100 }],
  bases: { blue: { pad: { x: 100, y: 860, w: 240, h: 40 } }, red: { pad: { x: 1600, y: 860, w: 240, h: 40 } } },
  cannons: [],
  props: [],
}
const BOTH = { left: true, right: true }
const NONE = { left: false, right: false }
const LEFT = { left: true, right: false }
type Setup = ReturnType<typeof setup>

function setup(map = flat, tweak: (config: Config) => void = () => {}, mode: Mode = 'pve') {
  const config = structuredClone(baseConfig)
  tweak(config)
  const game = createGame(map, [{ id: 'p1', team: 'blue', skin: DEFAULT_SKIN }], mode)
  return { config, game, r: game.rockets[0] }
}
function run({ game, config }: Setup, seconds: number, input: Input = NONE) {
  for (let i = 0; i < seconds * config.tickRate; i++) step(game, { p1: input }, config)
}
function runUntil({ game, config }: Setup, done: () => boolean, seconds: number) {
  for (let i = 0; i < seconds * config.tickRate; i++) {
    step(game, {}, config)
    if (done()) return true
  }
  return false
}

// Both engines: straight up.
{
  const t = setup()
  const y0 = t.r.y
  run(t, 0.5, BOTH)
  assert(t.r.alive && t.r.y < y0 - 20 && t.r.angle === 0, 'both engines should lift straight up')
}

// A map's gravity scales the world's: low gravity falls slower.
{
  const fall = (map: GameMap) => {
    const t = setup(map)
    Object.assign(t.r, { y: 300, landed: false })
    run(t, 0.5)
    return t.r.vy
  }
  const normal = fall(flat)
  assert(Math.abs(fall({ ...flat, gravity: 0.4 }) - normal * 0.4) < 1, 'gravity 0.4 should fall at 0.4x the speed')
}

// Round solids: the top of the ball is a landing spot, its steep flank isn't, and the corners of its rect are empty.
{
  const ball: Solid = { x: 900, y: 600, w: 300, h: 200, shape: 'round' }
  const drop = (x: number) => {
    const t = setup({ ...flat, solids: [...flat.solids, ball] })
    Object.assign(t.r, { x, y: 500, landed: false })
    runUntil(t, () => t.r.landed || !t.r.alive, 3)
    return t.r
  }
  const top = drop(1050)
  assert(top.alive && top.landed && Math.abs(top.y + 18 - 600) < 2, 'should land on top of the ball')
  assert(!drop(1195).alive, 'landing on the steep flank should crash')
  const map = { ...flat, solids: [ball] }
  assert(!solidAt(map, 905, 610) && solidAt(map, 1050, 700), "the rect's corners are empty, its middle solid")
}

// Lumpy solids: the outline fills its rect, keeps its shape when moved, its
// tops are landing spots where they're flat enough, and its undersides are where its outline ends below.
{
  const rock: Solid = { x: 900, y: 600, w: 320, h: 220, shape: 'lumpy' }
  const map = { ...flat, solids: [rock] }
  const grid: [number, number][] = []
  for (let x = 902; x < 1220; x += 6) {
    for (let y = 602; y < 820; y += 6) grid.push([x, y])
  }
  const touches = (points: [number, number][]) => points.some(([x, y]) => solidAt(map, x, y))
  const along = (f: (t: number) => [number, number]) => Array.from({ length: 160 }, (_, i) => f(i / 159))
  assert(touches(along((t) => [900 + t * 320, 602])) && touches(along((t) => [900 + t * 320, 818])), 'outline should reach top and bottom')
  assert(touches(along((t) => [902, 600 + t * 220])) && touches(along((t) => [1218, 600 + t * 220])), 'outline should reach both sides')
  const moved = { ...map, solids: [{ ...rock, x: 400, y: 100 }] }
  assert(grid.every(([x, y]) => Boolean(solidAt(map, x, y)) === Boolean(solidAt(moved, x - 500, y - 500))), 'moving a rock should keep its shape')

  const top = (x: number) => {
    const at = surfaceAt(rock, x, -1)
    assert(at, `a lumpy rock has a top at x ${x}`)
    return at
  }
  const flattest = Array.from({ length: 61 }, (_, i) => 1000 + i * 2).sort((a, b) => top(a).slope - top(b).slope)[0]
  const t = setup({ ...flat, solids: [...flat.solids, rock] })
  Object.assign(t.r, { x: flattest, y: top(flattest).y - 100, landed: false })
  runUntil(t, () => t.r.landed || !t.r.alive, 3)
  assert(t.r.alive && t.r.landed, `should land on the lumpy top at x ${flattest}`)

  for (const x of [960, 1060, 1160]) {
    const bottom = surfaceAt(rock, x, 1)?.y
    assert(bottom !== undefined && solidAt(map, x, bottom - 1) && !solidAt(map, x, bottom + 1), `underside at x ${x} should be where the rock ends`)
  }
}

// Spinning solids turn about their center as game time passes, bullets and hulls meet them where they are
// now, and the map they came from is left alone. Feet on one crash: they can't be landed on.
{
  const bar = { x: 800, y: 580, w: 400, h: 40, spin: Math.PI / 2 } // a quarter turn per second
  const t = setup({ ...flat, solids: [...flat.solids, bar] })
  const turning = t.game.map.solids.find((s) => s.spin)
  assert(solidAt(t.game.map, 1180, 600) && !solidAt(t.game.map, 1000, 760), 'flat at the start')
  run(t, 1)
  assert(!solidAt(t.game.map, 1180, 600) && solidAt(t.game.map, 1000, 760), 'upright after a quarter turn')
  assert(turning && Math.abs((turning.angle ?? 0) - Math.PI / 2) < 0.02 && !('angle' in bar), 'the game turns its own copy')

  const land = setup({ ...flat, solids: [...flat.solids, { ...bar, spin: 0.01 }] })
  Object.assign(land.r, { x: 1000, y: 540, landed: false })
  runUntil(land, () => land.r.landed || !land.r.alive, 2)
  assert(!land.r.alive, 'touching down on a spinning solid should crash')
}

// Left engine tilts nose right; engines further out spin faster.
{
  const tilt = (offset: number) => {
    const t = setup(flat, (c) => { c.rocket.engineOffset = offset })
    run(t, 0.3, BOTH)
    run(t, 0.2, LEFT)
    assert(t.r.alive, `rocket crashed during tilt test (offset ${offset})`)
    return t.r.angle
  }
  assert(tilt(8) > 0, 'left engine should rotate clockwise')
  assert(tilt(20) > tilt(8), 'larger engineOffset should spin faster')
}

// Soft landing survives.
{
  const t = setup()
  Object.assign(t.r, { x: 1000, y: 900 - 18 - 10, landed: false })
  run(t, 1)
  assert(t.r.alive && t.r.landed, 'gentle drop should land')
}

// Sloppy landing — very fast, sliding, leaning — still lands on its feet.
{
  const t = setup()
  Object.assign(t.r, { x: 1000, y: 870, angle: 0.8, vx: 1500, vy: 1500, landed: false })
  run(t, 0.5)
  assert(t.r.alive && t.r.landed, 'sloppy landing should survive')
}

// Landing on the side crashes.
{
  const t = setup()
  Object.assign(t.r, { x: 1000, y: 870, angle: 1.3, landed: false })
  assert(runUntil(t, () => !t.r.alive, 1), 'side landing should crash')
}

// Nose-first touchdown crashes, however gentle.
{
  const t = setup()
  Object.assign(t.r, { x: 1000, y: 900 - 24 - 5, angle: Math.PI, landed: false })
  assert(runUntil(t, () => !t.r.alive, 1), 'nose touchdown should crash')
}

// Even a gentle touchdown on water crashes.
{
  const seaFloor: Solid = { ...flat.solids[0], kind: 'water' }
  const sea = { ...flat, solids: [seaFloor] }
  const t = setup(sea)
  Object.assign(t.r, { x: 1000, y: 900 - 18 - 10, landed: false })
  assert(runUntil(t, () => !t.r.alive, 1), 'landing on water should crash')
}

// Crash respawns after respawnSeconds.
{
  const t = setup()
  Object.assign(t.r, { x: 1000, y: 870, angle: Math.PI, landed: false })
  assert(runUntil(t, () => !t.r.alive, 3), 'upside-down landing should crash')
  const deadAt = t.game.time
  assert(runUntil(t, () => t.r.alive, 5), 'should respawn')
  assert(Math.abs(t.game.time - deadAt - t.config.rules.respawnSeconds) < 0.02, 'respawn delay')
  assert(t.r.landed && t.r.x < 340, 'respawn on own pad')
}

// Capture the flag; dying with the flag returns it.
{
  const t = setup()
  const enemyFlag = flagHome(flat.bases.red)
  const ownPad = flat.bases.blue.pad
  const grab = () => {
    Object.assign(t.r, { x: enemyFlag.x, y: enemyFlag.y - 20, vx: 0, vy: 0 })
    step(t.game, {}, t.config)
    assert.equal(t.game.teams.red.flagCarrier, 'p1', 'should pick up enemy flag')
  }
  grab()
  Object.assign(t.r, { x: ownPad.x + 40, y: ownPad.y - 18 })
  step(t.game, {}, t.config)
  assert.equal(t.game.teams.blue.score, 1, 'landing on own pad with flag scores')
  assert.equal(t.game.teams.red.flagCarrier, null, 'flag returns after capture')

  grab()
  Object.assign(t.r, { angle: Math.PI, landed: false })
  assert(runUntil(t, () => !t.r.alive, 1), 'should crash')
  assert.equal(t.game.teams.red.flagCarrier, null, 'flag returns when carrier dies')
}

// Cannon shoots down a rocket in range. In PvE that scores for the computer; crashes don't.
{
  const t = setup({ ...flat, cannons: [{ x: 1000, y: 900, team: 'red' }] }, (c) => { c.cannon.enabled = true })
  Object.assign(t.r, { x: 1400, y: 900 - 18 })
  assert(runUntil(t, () => !t.r.alive, 6), 'cannon should hit rocket in range')
  assert.equal(t.game.teams.red.score, 1, 'PvE: shoot-down scores for the computer')

  t.config.rules.cpuKillsToWin = 2
  Object.assign(t.r, { x: 1400, y: 900 - 18, alive: true })
  assert(runUntil(t, () => t.game.winner === 'red', 6), 'PvE: computer wins after cpuKillsToWin shoot-downs')

  const crash = setup()
  Object.assign(crash.r, { x: 1000, y: 870, angle: Math.PI, landed: false })
  assert(runUntil(crash, () => !crash.r.alive, 1) && crash.game.teams.red.score === 0, 'PvE: crashes are not kills')
}

// A map's cannonRange replaces the config's: a rocket past it is left alone.
{
  const t = setup({ ...flat, cannonRange: 300, cannons: [{ x: 1000, y: 900, team: 'red' }] }, (c) => { c.cannon.enabled = true })
  Object.assign(t.r, { x: 1400, y: 900 - 18 })
  run(t, 3)
  assert(t.r.alive && t.game.bullets.length === 0, 'cannon should hold fire past the map cannon range')
}

// A hanging cannon hangs under its block, starts aimed straight down and shoots a rocket below it.
{
  const ceiling = { x: 900, y: 300, w: 200, h: 100 }
  const map: GameMap = { ...flat, solids: [...flat.solids, ceiling], cannons: [{ x: 1000, y: 400, team: 'red', hang: true }] }
  const t = setup(map, (c) => { c.cannon.enabled = true })
  const pedestal = solidAt(t.game.map, 1000, 405)
  assert(pedestal && t.game.map.solids.includes(pedestal) && pedestal !== ceiling, 'pedestal hangs below the block')
  assert.equal(t.game.cannons[0].aim, Math.PI / 2, 'hanging cannon rests aimed down')
  Object.assign(t.r, { x: 1000, y: 900 - 18 })
  assert(runUntil(t, () => !t.r.alive, 3), 'hanging cannon should hit a rocket below')
}

// PvE: players have no flag. PvP: both do, and yours must be home to capture.
{
  const pve = setup()
  assert.equal(pve.game.teams.blue.flag, false, 'PvE: no player flag')
  const pvp = setup(flat, () => {}, 'pvp')
  addPlayer(pvp.game, { id: 'p2', team: 'red', skin: DEFAULT_SKIN })
  const [blue, red] = pvp.game.rockets
  const blueFlag = flagHome(flat.bases.blue)
  Object.assign(red, { x: blueFlag.x, y: blueFlag.y - 20 })
  Object.assign(blue, { x: flagHome(flat.bases.red).x, y: flagHome(flat.bases.red).y - 20 })
  step(pvp.game, {}, pvp.config)
  assert.equal(pvp.game.teams.blue.flagCarrier, 'p2', 'PvP: red takes blue flag')
  Object.assign(blue, { x: flat.bases.blue.pad.x + 40, y: flat.bases.blue.pad.y - 18 })
  step(pvp.game, {}, pvp.config)
  assert.equal(pvp.game.teams.blue.score, 0, "PvP: can't capture while your flag is taken")
}

// Players join and leave mid-game; slots are reused, full teams refuse.
{
  const t = setup()
  addPlayer(t.game, { id: 'p2', team: 'blue', skin: DEFAULT_SKIN })
  removePlayer(t.game, 'p1')
  addPlayer(t.game, { id: 'p3', team: 'blue', skin: DEFAULT_SKIN })
  assert.deepEqual(t.game.rockets.map((r) => [r.id, r.slot]), [['p2', 1], ['p3', 0]], 'slot reuse')
  while (t.game.rockets.length < maxPlayersPerTeam(t.game, 'blue')) {
    addPlayer(t.game, { id: `x${t.game.rockets.length}`, team: 'blue', skin: DEFAULT_SKIN })
  }
  assert.throws(() => addPlayer(t.game, { id: 'late', team: 'blue', skin: DEFAULT_SKIN }), /full/)
}

console.log('sim ok')
