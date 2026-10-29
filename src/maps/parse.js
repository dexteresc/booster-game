// Map format, checked wherever maps come in (game load, editor save on the dev server).
// Rects are { x, y, w, h } with y pointing down. `water` solids are sea: touching it crashes.
// Co-op vs CPU: blue (players) steal red's flag. Cannon x,y = the surface it stands on.
// Returns a clean copy with only known fields; throws naming the bad field.

export const TEAMS = ['blue', 'red']
const MIN_PAD_WIDTH = 40 // room for one spawn slot

export function parseMap(raw, label) {
  const at = (path) => `Map "${label}": ${path}`
  if (!raw || typeof raw !== 'object') throw new Error(`${at('map')} must be an object`)
  return {
    width: positive(raw.width, at('width')),
    height: positive(raw.height, at('height')),
    solids: list(raw.solids, at('solids')).map((s, i) => solid(s, at(`solids[${i}]`))),
    bases: Object.fromEntries(TEAMS.map((team) => [team, { pad: pad(raw.bases?.[team]?.pad, at(`bases.${team}.pad`)) }])),
    cannons: list(raw.cannons, at('cannons')).map((c, i) => cannon(c, at(`cannons[${i}]`))),
  }
}

function solid(s, path) {
  const r = rect(s, path)
  return s.water === true ? { ...r, water: true } : r
}

function pad(p, path) {
  const r = rect(p, path)
  if (r.w < MIN_PAD_WIDTH) throw new Error(`${path}.w must be at least ${MIN_PAD_WIDTH}, got ${r.w}`)
  return r
}

function cannon(c, path) {
  if (!TEAMS.includes(c?.team)) throw new Error(`${path}.team must be one of ${TEAMS}, got ${JSON.stringify(c?.team)}`)
  return { x: finite(c.x, `${path}.x`), y: finite(c.y, `${path}.y`), team: c.team }
}

function rect(r, path) {
  if (!r || typeof r !== 'object') throw new Error(`${path} must be an object`)
  return { x: finite(r.x, `${path}.x`), y: finite(r.y, `${path}.y`), w: positive(r.w, `${path}.w`), h: positive(r.h, `${path}.h`) }
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
