import { propBounds } from '../art/props/boxes.ts'
import { MIN_PAD_WIDTH, PROP_KINDS, SHAPES } from '../maps/parse.ts'
import type { CannonSpot, GameMap, Prop, PropKind, Rect, Solid, SolidKind } from '../maps/parse.ts'
import { cannonPedestal } from '../sim/cannon.ts'
import { solidAt, surfaceAt } from '../sim/geometry.ts'

// Editor state and edits on it. No DOM here.
// An item's obj lives inside editor.map. Solids and pads are rects; cannons and props stand on a surface.

export type Point = { x: number; y: number }
export type View = Point & { zoom: number }
export type RectItem = { kind: 'solid' | 'pad'; obj: Solid }
export type StandingItem = { kind: 'cannon'; obj: CannonSpot } | { kind: 'prop'; obj: Prop }
export type Item = RectItem | StandingItem
type BlockTool = 'rock' | SolidKind
export type PlacingTool = 'cannon' | BlockTool | PropKind
export type Tool = 'select' | PlacingTool
export type Edges = { l: boolean; r: boolean; t: boolean; b: boolean }
export type Editor = {
  name: string | null // file name, null until first save
  map: GameMap
  saved: string
  tool: Tool
  selected: Item | null
  view: View
  history: string[] // JSON of map before each edit
}

export const GRID = 10
const CANNON_HEIGHT = 30 // click box: pedestal wide, this tall
const SURFACE_REACH = 40 // a cannon or prop dropped this far past a surface still lands on it

export function createEditor(name: string | null, map: GameMap): Editor {
  return {
    name,
    map: structuredClone(map),
    saved: JSON.stringify(map),
    tool: 'select',
    selected: null,
    view: { x: map.width / 2, y: map.height / 2, zoom: 1 },
    history: [],
  }
}

export function newMap(): GameMap {
  return {
    mode: 'pve',
    biome: 'desert',
    width: 3200,
    height: 1400,
    solids: [{ x: 0, y: 1300, w: 3200, h: 100, kind: 'water' }],
    bases: { blue: { pad: { x: 120, y: 1240, w: 240, h: 60 } }, red: { pad: { x: 2840, y: 1240, w: 240, h: 60 } } },
    cannons: [],
    props: [],
  }
}

export const isDirty = (editor: Editor): boolean => JSON.stringify(editor.map) !== editor.saved

export const snap = (v: number): number => Math.round(v / GRID) * GRID

export const isRect = (item: Item): item is RectItem => item.kind === 'solid' || item.kind === 'pad'

export const isPropKind = (tool: Tool): tool is PropKind => PROP_KINDS.some((kind) => kind === tool)

// Call before every edit so it can be undone.
export function remember(editor: Editor): void {
  editor.history.push(JSON.stringify(editor.map))
}

// Drops the last snapshot if the edit since then changed nothing (a click without a drag).
export function forgetIfUnchanged(editor: Editor): void {
  if (editor.history.at(-1) === JSON.stringify(editor.map)) editor.history.pop()
}

export function undo(editor: Editor): void {
  const previous = editor.history.pop()
  if (!previous) return
  editor.map = JSON.parse(previous)
  editor.selected = null
}

export const isFlippable = (item: Item | null): item is StandingItem => item?.kind === 'prop' || item?.kind === 'cannon'

// Mirrors the selected prop to face the other way, or turns the selected cannon over to hang under
// the block it stands on (and back). Left out of the file when false.
export function flipSelected(editor: Editor): void {
  const { selected } = editor
  if (!isFlippable(selected)) return
  remember(editor)
  if (selected.kind === 'cannon') turnOver(editor.map, selected.obj)
  else if (selected.obj.flip) delete selected.obj.flip
  else selected.obj.flip = true
}

function turnOver(map: GameMap, cannon: CannonSpot): void {
  const block = solidAt(map, cannon.x, cannon.hang ? cannon.y - 1 : cannon.y + 1)
  if (cannon.hang) delete cannon.hang
  else cannon.hang = true
  if (!block || !map.solids.includes(block)) return
  cannon.y = surfaceAt(block, cannon.x, cannon.hang ? 1 : -1)?.y ?? cannon.y
}

// Cycles the selected solid square → round → lumpy → square. Left out of the file when square.
export function shapeSelected(editor: Editor): void {
  const { selected } = editor
  if (selected?.kind !== 'solid') return
  remember(editor)
  const next = SHAPES[selected.obj.shape ? SHAPES.indexOf(selected.obj.shape) + 1 : 0]
  if (next) selected.obj.shape = next
  else delete selected.obj.shape
}

// Pads can't go: every map needs both bases.
export function removeSelected(editor: Editor): void {
  const { selected, map } = editor
  if (!selected || selected.kind === 'pad') return
  remember(editor)
  if (selected.kind === 'solid') map.solids.splice(map.solids.indexOf(selected.obj), 1)
  if (selected.kind === 'cannon') map.cannons.splice(map.cannons.indexOf(selected.obj), 1)
  if (selected.kind === 'prop') map.props.splice(map.props.indexOf(selected.obj), 1)
  editor.selected = null
}

// kind: a solid kind; 'rock' is the default and left out of the file.
export function addRect(editor: Editor, at: Point, kind: BlockTool): Solid {
  remember(editor)
  const rect: Solid = { x: snap(at.x), y: snap(at.y), w: 0, h: 0, ...(kind !== 'rock' && { kind }) }
  editor.map.solids.push(rect)
  editor.selected = { kind: 'solid', obj: rect }
  return rect
}

// PvE cannons are the computer's. PvP cannons guard the base on their side of the map.
export function addCannon(editor: Editor, at: Point): CannonSpot {
  const { map } = editor
  const obj: CannonSpot = { x: 0, y: 0, team: map.mode === 'pvp' && at.x < map.width / 2 ? 'blue' : 'red' }
  addStanding(editor, { kind: 'cannon', obj }, at)
  return obj
}

// PvP maps are symmetric: build the left (blue) half, this replaces the right half with its mirror image.
export function mirrorLeftHalf(editor: Editor): void {
  remember(editor)
  Object.assign(editor.map, mirrorMap(editor.map))
  editor.selected = null
}

// Keeps what's centered left of (or on) the middle line, adds its mirror image on the right.
// Mirrored props face the other way; cannons belong to the side they stand on.
export function mirrorMap(map: GameMap): Pick<GameMap, 'solids' | 'cannons' | 'props' | 'bases'> {
  const { width } = map
  const half = <T>(list: T[], centerX: (o: T) => number, mirror: (o: T) => T): T[] => {
    const kept = list.filter((o) => centerX(o) <= width / 2)
    return [...kept, ...kept.filter((o) => centerX(o) < width / 2).map(mirror)]
  }
  const blueCannon = (c: CannonSpot): CannonSpot => (c.x < width / 2 ? { ...c, team: 'blue' } : c)
  return {
    solids: half(map.solids, (s) => s.x + s.w / 2, (s) => ({ ...s, x: width - s.x - s.w })),
    cannons: half(map.cannons.map(blueCannon), (c) => c.x, (c) => ({ ...c, x: width - c.x, team: 'red' })),
    props: half(map.props, (p) => p.x, ({ flip, ...p }) => ({ ...p, x: width - p.x, ...(!flip && { flip: true }) })),
    bases: {
      ...map.bases,
      red: { pad: { ...map.bases.blue.pad, x: width - map.bases.blue.pad.x - map.bases.blue.pad.w } },
    },
  }
}

export function addProp(editor: Editor, at: Point, kind: PropKind): Prop {
  const obj: Prop = { kind, x: 0, y: 0 }
  addStanding(editor, { kind: 'prop', obj }, at)
  return obj
}

function addStanding(editor: Editor, item: StandingItem, at: Point): void {
  remember(editor)
  placeOnSurface(editor.map, item.obj, at)
  if (item.kind === 'cannon') editor.map.cannons.push(item.obj)
  else editor.map.props.push(item.obj)
  editor.selected = item
}

// Cannons and props stand on the nearest top surface under the pointer; a hanging cannon hangs from
// the nearest underside above it.
export function placeOnSurface(map: GameMap, obj: Point & { hang?: boolean }, at: Point): void {
  obj.x = snap(at.x)
  obj.y = surfaceNear(map, obj.x, at.y, obj.hang ? 1 : -1) ?? snap(at.y)
}

// side -1: the highest top below y; 1: the lowest underside above it. Pads are only stood on.
function surfaceNear(map: GameMap, x: number, y: number, side: -1 | 1): number | null {
  const pads = side < 0 ? Object.values(map.bases).map((b) => b.pad) : []
  const edges = [...map.solids, ...pads]
    .filter((s) => x >= s.x && x <= s.x + s.w)
    .map((s) => surfaceAt(s, x, side)?.y)
    .filter((edge): edge is number => edge !== undefined && (edge - y) * side <= SURFACE_REACH)
  return edges.length ? side * Math.max(...edges.map((edge) => edge * side)) : null
}

export function minSize(item: Item): { w: number; h: number } {
  return { w: item.kind === 'pad' ? MIN_PAD_WIDTH : GRID, h: GRID }
}

// Topmost first, matching draw order.
export function itemAt(map: GameMap, point: Point): Item | null {
  const items = [
    ...map.cannons.map((obj): Item => ({ kind: 'cannon', obj })),
    ...map.props.map((obj): Item => ({ kind: 'prop', obj })).reverse(),
    ...Object.values(map.bases).map((b): Item => ({ kind: 'pad', obj: b.pad })),
    ...map.solids.map((obj): Item => ({ kind: 'solid', obj })).reverse(),
  ]
  return items.find((item) => contains(boundsOf(item), point, 0)) ?? null
}

export function boundsOf({ kind, obj }: Item): Rect {
  if (kind === 'prop') return propBounds(obj)
  if (kind !== 'cannon') return obj
  const { x, w } = cannonPedestal(obj)
  return { x, y: obj.hang ? obj.y : obj.y - CANNON_HEIGHT, w, h: CANNON_HEIGHT }
}

// Which edges of rect are within tol of point, or null.
export function edgesNear(rect: Rect, point: Point, tol: number): Edges | null {
  if (!contains(rect, point, tol)) return null
  const edges = {
    l: Math.abs(point.x - rect.x) < tol,
    r: Math.abs(point.x - rect.x - rect.w) < tol,
    t: Math.abs(point.y - rect.y) < tol,
    b: Math.abs(point.y - rect.y - rect.h) < tol,
  }
  return Object.values(edges).some(Boolean) ? edges : null
}

function contains(rect: Rect, point: Point, pad: number): boolean {
  return (
    point.x >= rect.x - pad && point.x <= rect.x + rect.w + pad &&
    point.y >= rect.y - pad && point.y <= rect.y + rect.h + pad
  )
}
