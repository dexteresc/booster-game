import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { TEAMS, parseMap } from '../src/maps/parse.js'
import { mirrorMap } from '../src/editor/model.js'
import { createGame, maxPlayersPerTeam } from '../src/sim/game.js'
import { TEAM_SIZE } from '../src/lobby.js'

const dir = new URL('../src/maps/', import.meta.url)

// Every shipped map parses, and parsing keeps it as is. PvP maps are fair: mirroring changes nothing.
// PvP pads fit a full lobby team, or the last player to join can't spawn.
const sorted = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Array.isArray(v) ? v.map((o) => JSON.stringify(o)).sort() : v]))
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  assert.deepEqual(parseMap(raw, file), raw, `${file} should parse unchanged`)
  if (raw.mode !== 'pvp') continue
  assert.deepEqual(sorted({ ...raw, ...mirrorMap(raw) }), sorted(raw), `${file}: PvP map should be symmetric (editor: Mirror)`)
  const game = createGame(parseMap(raw, file), [], 'pvp')
  for (const team of TEAMS) assert(maxPlayersPerTeam(game, team) >= TEAM_SIZE, `${file}: ${team} pad should fit ${TEAM_SIZE} players`)
}

const canyon = JSON.parse(readFileSync(new URL('canyon.json', dir), 'utf8'))
const broken = (change) => {
  const map = structuredClone(canyon)
  change(map)
  return () => parseMap(map, 'test')
}
assert.throws(broken((m) => (m.solids[1].w = -5)), /solids\[1\]\.w must be positive/)
assert.throws(broken((m) => delete m.bases.red), /bases\.red\.pad must be an object/)
assert.throws(broken((m) => (m.bases.blue.pad.w = 20)), /bases\.blue\.pad\.w must be at least 40/)
assert.throws(broken((m) => (m.cannons[0].team = 'green')), /cannons\[0\]\.team/)
assert.throws(broken((m) => (m.solids[1].kind = 'cheese')), /solids\[1\]\.kind must be one of water,concrete,metal,hazard,panel,glass,planks,hull,stone/)
assert.throws(broken((m) => (m.solids[0].water = true)), /solids\[0\]\.water is no longer a field/)
assert.throws(broken((m) => (m.props = [{ kind: 'tree', x: 0, y: 0 }])), /props\[0\]\.kind must be one of lamp,starburst/)
assert.equal(parseMap({ ...canyon, extra: 1 }, 'test').extra, undefined, 'unknown fields dropped')
assert.throws(broken((m) => (m.biome = 'moon')), /biome must be one of desert,jungle,nautic/)
assert.throws(broken((m) => (m.mode = 'solo')), /mode must be one of pve,pvp/)
const flipped = parseMap({ ...canyon, props: [{ kind: 'lamp', x: 1, y: 2, flip: true }, { kind: 'lamp', x: 1, y: 2, flip: 'yes' }] }, 'test').props
assert.deepEqual(flipped, [{ kind: 'lamp', x: 1, y: 2, flip: true }, { kind: 'lamp', x: 1, y: 2 }], 'flip kept only when true')

console.log('maps ok')
