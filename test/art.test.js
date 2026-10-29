import assert from 'node:assert/strict'
import { BIOME_NAMES, PROP_KINDS, SOLID_KINDS } from '../src/maps/parse.js'
import { BIOMES, SKIES } from '../src/art/theme.js'
import { GROUND_ART } from '../src/art/ground.js'
import { SOLID_ART } from '../src/art/solids.js'
import { PROP_ART } from '../src/art/props/index.js'

// Every kind a map may contain has something that draws it.
for (const kind of SOLID_KINDS) if (kind !== 'water') assert(SOLID_ART[kind], `no art for solid kind "${kind}"`)
for (const kind of PROP_KINDS) assert(PROP_ART[kind], `no art for prop kind "${kind}"`)
assert.deepEqual(Object.keys(PROP_ART).sort(), [...PROP_KINDS].sort(), 'PROP_ART and PROP_KINDS should list the same props')

assert.deepEqual(Object.keys(BIOMES).sort(), [...BIOME_NAMES].sort(), 'BIOMES and BIOME_NAMES should list the same biomes')
for (const biome of BIOME_NAMES) {
  assert(GROUND_ART[biome], `no ground art for biome "${biome}"`)
  for (const [time, sky] of Object.entries(SKIES)) assert(sky.ground[biome], `no ${time} ground palette for biome "${biome}"`)
  for (const kind of BIOMES[biome].blocks) assert(kind === 'rock' || SOLID_KINDS.includes(kind), `biome "${biome}" offers unknown block "${kind}"`)
}

console.log('art ok')
