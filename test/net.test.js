import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from '../src/config.js'
import { parseMap } from '../src/maps/parse.js'
import { createGame, step } from '../src/sim/game.js'
import { decodeSnapshot, encodeSnapshot } from '../src/snapshot.js'
import { blend, createRemoteGame } from '../src/remote-game.js'

const map = parseMap(JSON.parse(readFileSync(new URL('../src/maps/duel.json', import.meta.url))))
const players = [{ id: 'host', team: 'blue', name: 'A' }, { id: 'b', team: 'red', name: 'B' }]
const ids = players.map((p) => p.id)
const close = (a, b, what) => assert(Math.abs(a - b) < 1e-3, `${what}: ${a} ≠ ${b}`)

// A game mid-flight, with a shot in the air and a crash this tick, so every section has something in it.
const game = createGame(map, players, 'pvp')
for (let i = 0; i < 60; i++) step(game, { host: { left: true, right: true }, b: { left: true, right: false } }, config)
game.bullets.push({ x: 500.25, y: 700.5, vx: -300, vy: 120, team: 'red', life: 1 })
game.teams.red.flagCarrier = 'host'
const events = [{ type: 'explode', x: 10, y: 20, team: 'blue' }, { type: 'capture', team: 'red' }]

// Round trip: what the screen needs survives, to float32 precision.
const buffer = encodeSnapshot(game, events)
const snap = decodeSnapshot(buffer, ids)
assert.equal(snap.time, game.time)
game.rockets.forEach((r, i) => {
  for (const k of ['x', 'y', 'angle']) close(snap.rockets[i][k], r[k], `rocket ${r.id} ${k}`)
  assert.equal(snap.rockets[i].alive, r.alive)
  assert.deepEqual(snap.rockets[i].input, { left: r.input.left, right: r.input.right })
})
game.cannons.forEach((c, i) => close(snap.cannons[i].aim, c.aim, `cannon ${i} aim`))
assert.equal(snap.bullets.length, game.bullets.length)
close(snap.bullets[0].vx, game.bullets[0].vx, 'bullet vx')
assert.deepEqual(snap.events.map((e) => e.type), events.map((e) => e.type))
assert.equal(snap.teams.red.flagCarrier, 'host')
assert.equal(snap.teams.blue.flagCarrier, null)
assert(buffer.byteLength < 250, `snapshot should be small, is ${buffer.byteLength} bytes`)
assert.throws(() => decodeSnapshot(buffer, ['host']), /roster/, 'a rocket count that disagrees with the roster should throw')

// Blending halfway between two snapshots puts rockets halfway, also across the ±π seam.
const at = (time, x, angle) => ({ ...snap, time, events: [], rockets: snap.rockets.map((r) => ({ ...r, alive: true, x, angle })) })
const shown = { ...createGame(map, players, 'pvp') }
blend(shown, at(1, 100, 3.1), at(1.1, 200, -3.1), 1.05)
close(shown.rockets[0].x, 150, 'blended x')
assert(Math.abs(Math.abs(shown.rockets[0].angle) - Math.PI) < 0.01, `angle should blend through π, got ${shown.rockets[0].angle}`)

// Remote game: draws DELAY behind, events fire once that moment reaches them.
const remote = createRemoteGame()
remote.roster(map, { mapName: 'duel', mode: 'pvp', players })
remote.snapshot(encodeSnapshot({ ...game, time: 10 }, events), 50)
assert.deepEqual(remote.show(50), [], 'events wait until the shown moment reaches them')
assert.equal(remote.show(50.2).length, events.length, 'events fire once due')
assert.deepEqual(remote.show(50.3), [], 'events fire only once')

console.log('net ok')
