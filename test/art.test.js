import assert from 'node:assert/strict'
import { PROP_KINDS, SOLID_KINDS } from '../src/maps/parse.js'
import { SOLID_ART } from '../src/art/solids.js'
import { PROP_ART } from '../src/art/props/index.js'

// Every kind a map may contain has something that draws it.
for (const kind of SOLID_KINDS) if (kind !== 'water') assert(SOLID_ART[kind], `no art for solid kind "${kind}"`)
for (const kind of PROP_KINDS) assert(PROP_ART[kind], `no art for prop kind "${kind}"`)
assert.deepEqual(Object.keys(PROP_ART).sort(), [...PROP_KINDS].sort(), 'PROP_ART and PROP_KINDS should list the same props')

console.log('art ok')
