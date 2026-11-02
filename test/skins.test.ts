import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { GameView } from '../src/sim/game.ts'
import { parseMap } from '../src/maps/parse.ts'
import { createGame } from '../src/sim/game.ts'
import { DEFAULT_SKIN, SKINS, SKIN_PARTS, cleanSkin } from '../src/art/skins.ts'
import { GOALS, NO_STATS, cleanStats, createProgress, reached } from '../src/progress.ts'

// Skins from storage or other browsers: known options pass, anything else becomes the default.
assert.deepEqual(cleanSkin(null), DEFAULT_SKIN)
assert.deepEqual(cleanSkin({ body: 'needle', paint: 'nope', flame: 7, trail: 'rainbow' }), { ...DEFAULT_SKIN, body: 'needle', trail: 'rainbow' })
assert.deepEqual(cleanSkin({ body: 'constructor' }), DEFAULT_SKIN, 'prototype keys are not options')
for (const part of SKIN_PARTS) {
  const options = Object.values<{ unlock: string | null }>(SKINS[part])
  assert(options.some((o) => o.unlock === null), `part "${part}" needs a free option`)
  assert(options.some((o) => o.unlock !== null), `part "${part}" needs something to unlock`)
}
assert.deepEqual(cleanStats({ captures: 3, wins: -1, deaths: 'x', extra: 1 }), { ...NO_STATS, captures: 3 })

// Progress counts what the screen shows: a capture, a death, a win.
const map = parseMap(JSON.parse(readFileSync(new URL('../src/maps/duel.json', import.meta.url), 'utf8')), 'duel')
const game: GameView = createGame(map, [{ id: 'me', team: 'blue', skin: DEFAULT_SKIN }], 'pvp')
const me = game.rockets[0]
let saves = 0
const progress = createProgress({ ...NO_STATS }, () => saves++)
const frame = (dt = 1 / 60) => progress.observe(game, 'me', dt)
frame()
game.teams.red.flagCarrier = 'me'
frame()
game.teams.red.flagCarrier = null
game.teams.blue.score = 1
assert.deepEqual(frame(), ['capture-1'], 'scoring while carrying = a capture, reaching the first goal')
me.alive = false
frame()
me.alive = true
frame()
assert.equal(progress.stats.deaths, 1)
me.input = { left: true, right: false }
for (let i = 0; i < 60; i++) frame()
assert(Math.abs(progress.stats.thrustSeconds - 1) < 1e-6, `thrust time adds up, got ${progress.stats.thrustSeconds}`)
game.winner = 'blue'
assert.deepEqual(frame().sort(), ['win-1'], 'a win is counted once, as a match and a win')
assert.equal(progress.stats.matches, 1)
frame()
assert.equal(progress.stats.wins, 1, 'the same winner frame after frame counts once')
assert(saves >= 3, `stats should be saved when they change, saved ${saves} times`)
assert(reached('capture-1', progress.stats) && !reached('capture-5', progress.stats))
assert(Object.values(GOALS).every((g) => g.target > 0))

console.log('skins ok')
