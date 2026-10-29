import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parseMap } from '../src/maps/parse.js'

const dir = new URL('../src/maps/', import.meta.url)

// Every shipped map parses, and parsing keeps it as is.
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  assert.deepEqual(parseMap(raw, file), raw, `${file} should parse unchanged`)
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
assert.throws(broken((m) => (m.solids[1].kind = 'cheese')), /solids\[1\]\.kind must be one of water,concrete,metal,hazard,panel,glass/)
assert.throws(broken((m) => (m.solids[0].water = true)), /solids\[0\]\.water is no longer a field/)
assert.throws(broken((m) => m.props.push({ kind: 'tree', x: 0, y: 0 })), /props\[0\]\.kind must be one of lamp,starburst/)
assert.equal(parseMap({ ...canyon, extra: 1 }, 'test').extra, undefined, 'unknown fields dropped')

console.log('maps ok')
