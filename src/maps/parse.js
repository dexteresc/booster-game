// Map format, checked wherever maps come in (game load, editor save on the dev server).
// Rects are { x, y, w, h } with y pointing down. Solids block rockets; `kind` picks the look:
// left out = rock, 'water' is sea (touching it crashes), the rest are building materials.
// Props are decoration standing on a surface, no collision. Cannon x,y = the surface it stands on.
// biome picks how rock, the hills and the weather look (src/art/theme.js BIOMES); left out = desert.
// Co-op vs CPU: blue (players) steal red's flag.
// Returns a clean copy with only known fields; throws naming the bad field.

export const TEAMS = ['blue', 'red']
export const BIOME_NAMES = ['desert', 'jungle', 'nautic']
export const SOLID_KINDS = ['water', 'concrete', 'metal', 'hazard', 'panel', 'glass', 'planks', 'hull'] // art in src/art/solids.js
export const PROP_KINDS = ['lamp', 'starburst', 'beacon', 'tank', 'radar', 'saucer', 'palm'] // art in src/art/props/
const MIN_PAD_WIDTH = 40 // room for one spawn slot

export function parseMap(raw, label) {
  const at = (path) => `Map "${label}": ${path}`
  if (!raw || typeof raw !== 'object') throw new Error(`${at('map')} must be an object`)
  return {
    biome: oneOf(raw.biome ?? 'desert', BIOME_NAMES, at('biome')),
    width: positive(raw.width, at('width')),
    height: positive(raw.height, at('height')),
    solids: list(raw.solids, at('solids')).map((s, i) => solid(s, at(`solids[${i}]`))),
    bases: Object.fromEntries(TEAMS.map((team) => [team, { pad: pad(raw.bases?.[team]?.pad, at(`bases.${team}.pad`)) }])),
    cannons: list(raw.cannons, at('cannons')).map((c, i) => cannon(c, at(`cannons[${i}]`))),
    props: list(raw.props, at('props')).map((p, i) => prop(p, at(`props[${i}]`))),
  }
}

function solid(s, path) {
  const r = rect(s, path)
  if ('water' in s) throw new Error(`${path}.water is no longer a field, use "kind": "water"`)
  return s.kind === undefined ? r : { ...r, kind: oneOf(s.kind, SOLID_KINDS, `${path}.kind`) }
}

function pad(p, path) {
  const r = rect(p, path)
  if (r.w < MIN_PAD_WIDTH) throw new Error(`${path}.w must be at least ${MIN_PAD_WIDTH}, got ${r.w}`)
  return r
}

function cannon(c, path) {
  return { x: finite(c?.x, `${path}.x`), y: finite(c?.y, `${path}.y`), team: oneOf(c?.team, TEAMS, `${path}.team`) }
}

function prop(p, path) {
  return { kind: oneOf(p?.kind, PROP_KINDS, `${path}.kind`), x: finite(p.x, `${path}.x`), y: finite(p.y, `${path}.y`) }
}

function rect(r, path) {
  if (!r || typeof r !== 'object') throw new Error(`${path} must be an object`)
  return { x: finite(r.x, `${path}.x`), y: finite(r.y, `${path}.y`), w: positive(r.w, `${path}.w`), h: positive(r.h, `${path}.h`) }
}

function oneOf(v, options, path) {
  if (!options.includes(v)) throw new Error(`${path} must be one of ${options}, got ${JSON.stringify(v)}`)
  return v
}

function list(v, path) {
  if (!Array.isArray(v)) throw new Error(`${path} must be an array`)
  return v
}

function finite(v, path) {
  if (!Number.isFinite(v)) throw new Error(`${path} must be a number, got ${JSON.stringify(v)}`)
  return v
}

function positive(v, path) {
  if (!(finite(v, path) > 0)) throw new Error(`${path} must be positive, got ${v}`)
  return v
}
