// Map format, checked wherever maps come in (game load, editor save on the dev server).
// Rects are { x, y, w, h } with y pointing down. Solids block rockets; `kind` picks the look:
// left out = rock, 'water' is sea (touching it crashes), the rest are building materials.
// shape: 'round' fills the ellipse inside the rect instead (domes, tanks), 'lumpy' a rough potato outline
// (asteroids); left out = rect. spin: turns the solid about its rect's center, radians per
// second, clockwise; a spinning solid can't be landed on.
// Props are decoration standing on a surface, no collision; `flip: true` mirrors one to face the
// other way. Cannon x,y = the surface it stands on; `hang: true` hangs one upside down from the underside at x,y.
// biome picks how rock, the hills and the weather look (src/art/theme.ts BIOMES); left out = desert.
// mode: 'pve' = co-op vs CPU, blue (players) steal red's flag past red cannons; left out = pve.
// 'pvp' = team vs team: symmetric, both teams have a flag and cannons near their base.
// gravity: share of config.world.gravity on this map (0.4 = floaty); left out = 1.
// cannonRange: how far this map's cannons see and shoot; left out = config.cannon.range.
// Returns a clean copy with only known fields; throws naming the bad field.

import { SLOT_SPACING } from '../sim/rocket.ts'

export const TEAMS = ['blue', 'red'] as const
const MODES = ['pve', 'pvp'] as const
export const BIOME_NAMES = ['desert', 'jungle', 'nautic', 'belt'] as const
export const SHAPES = ['round', 'lumpy'] as const
export const SOLID_KINDS = ['water', 'concrete', 'metal', 'hazard', 'panel', 'glass', 'planks', 'hull', 'stone'] as const // art in src/art/solids.ts
export const PROP_KINDS = ['lamp', 'starburst', 'beacon', 'tank', 'radar', 'saucer', 'palm', 'statue'] as const // art in src/art/props/
export const MIN_PAD_WIDTH = SLOT_SPACING // room for one spawn slot

export type Team = (typeof TEAMS)[number]
export type Mode = (typeof MODES)[number]
export type Biome = (typeof BIOME_NAMES)[number]
export type SolidKind = (typeof SOLID_KINDS)[number]
export type PropKind = (typeof PROP_KINDS)[number]
export type Shape = (typeof SHAPES)[number]

export type Rect = { x: number; y: number; w: number; h: number }
export type Solid = Rect & { kind?: SolidKind; shape?: Shape; spin?: number }
export type Prop = { kind: PropKind; x: number; y: number; flip?: boolean }
export type CannonSpot = { x: number; y: number; team: Team; hang?: boolean }
export type Base = { pad: Rect }
export type GameMap = {
  mode: Mode
  biome: Biome
  gravity?: number
  cannonRange?: number
  width: number
  height: number
  solids: Solid[]
  bases: Record<Team, Base>
  cannons: CannonSpot[]
  props: Prop[]
}

export function parseMap(raw: unknown, label: string): GameMap {
  const at = (path: string) => `Map "${label}": ${path}`
  if (!isObject(raw)) throw new Error(`${at('map')} must be an object`)
  return {
    mode: oneOf(raw.mode ?? 'pve', MODES, at('mode')),
    biome: oneOf(raw.biome ?? 'desert', BIOME_NAMES, at('biome')),
    ...(raw.gravity !== undefined && { gravity: positive(raw.gravity, at('gravity')) }),
    ...(raw.cannonRange !== undefined && { cannonRange: positive(raw.cannonRange, at('cannonRange')) }),
    width: positive(raw.width, at('width')),
    height: positive(raw.height, at('height')),
    solids: list(raw.solids, at('solids')).map((s, i) => solid(s, at(`solids[${i}]`))),
    bases: Object.fromEntries(TEAMS.map((team) => [team, { pad: pad(field(field(raw.bases, team), 'pad'), at(`bases.${team}.pad`)) }])) as Record<Team, Base>,
    cannons: list(raw.cannons, at('cannons')).map((c, i) => cannon(c, at(`cannons[${i}]`))),
    props: list(raw.props, at('props')).map((p, i) => prop(p, at(`props[${i}]`))),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

// value.key, or undefined when value isn't an object at all.
function field(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined
}

function solid(raw: unknown, path: string): Solid {
  const r = rect(raw, path)
  if (field(raw, 'water') !== undefined) throw new Error(`${path}.water is no longer a field, use "kind": "water"`)
  const [kind, shape, spin] = [field(raw, 'kind'), field(raw, 'shape'), field(raw, 'spin')]
  return {
    ...r,
    ...(kind !== undefined && { kind: oneOf(kind, SOLID_KINDS, `${path}.kind`) }),
    ...(shape !== undefined && { shape: oneOf(shape, SHAPES, `${path}.shape`) }),
    ...(spin !== undefined && { spin: finite(spin, `${path}.spin`) }),
  }
}

function pad(raw: unknown, path: string): Rect {
  const r = rect(raw, path)
  if (r.w < MIN_PAD_WIDTH) throw new Error(`${path}.w must be at least ${MIN_PAD_WIDTH}, got ${r.w}`)
  return r
}

function cannon(raw: unknown, path: string): CannonSpot {
  return {
    x: finite(field(raw, 'x'), `${path}.x`),
    y: finite(field(raw, 'y'), `${path}.y`),
    team: oneOf(field(raw, 'team'), TEAMS, `${path}.team`),
    ...(field(raw, 'hang') === true && { hang: true }),
  }
}

function prop(raw: unknown, path: string): Prop {
  const kind = oneOf(field(raw, 'kind'), PROP_KINDS, `${path}.kind`)
  return { kind, x: finite(field(raw, 'x'), `${path}.x`), y: finite(field(raw, 'y'), `${path}.y`), ...(field(raw, 'flip') === true && { flip: true }) }
}

function rect(raw: unknown, path: string): Rect {
  if (!isObject(raw)) throw new Error(`${path} must be an object`)
  return { x: finite(raw.x, `${path}.x`), y: finite(raw.y, `${path}.y`), w: positive(raw.w, `${path}.w`), h: positive(raw.h, `${path}.h`) }
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (!options.includes(value as T)) throw new Error(`${path} must be one of ${options}, got ${JSON.stringify(value)}`)
  return value as T
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a number, got ${JSON.stringify(value)}`)
  return value
}

function positive(value: unknown, path: string): number {
  const n = finite(value, path)
  if (!(n > 0)) throw new Error(`${path} must be positive, got ${n}`)
  return n
}
