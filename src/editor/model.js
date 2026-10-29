import { propBounds } from '../art/props/index.js'

// Editor state and edits on it. No DOM here.
// An item is { kind: 'solid' | 'pad' | 'cannon' | 'prop', obj } where obj lives inside editor.map.
// Solids and pads are rects; cannons and props stand on a surface.

export const GRID = 10
const MIN_PAD_WIDTH = 40
const CANNON_BOX = { halfWidth: 14, height: 30 }
const SURFACE_REACH = 40 // a cannon or prop dropped this far below a top edge still lands on it

export function createEditor(name, map) {
  return {
    name, // file name, null until first save
    map: structuredClone(map),
    saved: JSON.stringify(map),
    tool: 'select', // select | cannon | a solid kind ('rock' included) | a prop kind
    selected: null,
    view: { x: map.width / 2, y: map.height / 2, zoom: 1 },
    history: [], // JSON of map before each edit
  }
}

export function newMap() {
  return {
    biome: 'desert',
    width: 3200,
    height: 1400,
    solids: [{ x: 0, y: 1300, w: 3200, h: 100, kind: 'water' }],
    bases: { blue: { pad: { x: 120, y: 1240, w: 240, h: 60 } }, red: { pad: { x: 2840, y: 1240, w: 240, h: 60 } } },
    cannons: [],
    props: [],
  }
}

export const isDirty = (editor) => JSON.stringify(editor.map) !== editor.saved

export const snap = (v) => Math.round(v / GRID) * GRID

export const isRect = ({ kind }) => kind === 'solid' || kind === 'pad'

// Call before every edit so it can be undone.
export function remember(editor) {
  editor.history.push(JSON.stringify(editor.map))
}

// Drops the last snapshot if the edit since then changed nothing (a click without a drag).
export function forgetIfUnchanged(editor) {
  if (editor.history.at(-1) === JSON.stringify(editor.map)) editor.history.pop()
}

export function undo(editor) {
  const previous = editor.history.pop()
  if (!previous) return
  editor.map = JSON.parse(previous)
  editor.selected = null
}

// Pads can't go: every map needs both bases.
export function removeSelected(editor) {
  const { selected, map } = editor
  if (!selected || selected.kind === 'pad') return
  remember(editor)
  if (selected.kind === 'solid') map.solids.splice(map.solids.indexOf(selected.obj), 1)
  if (selected.kind === 'cannon') map.cannons.splice(map.cannons.indexOf(selected.obj), 1)
  if (selected.kind === 'prop') map.props.splice(map.props.indexOf(selected.obj), 1)
  editor.selected = null
}

// kind: a solid kind; 'rock' is the default and left out of the file.
export function addRect(editor, at, kind) {
  remember(editor)
  const rect = { x: snap(at.x), y: snap(at.y), w: 0, h: 0, ...(kind !== 'rock' && { kind }) }
  editor.map.solids.push(rect)
  editor.selected = { kind: 'solid', obj: rect }
  return rect
}

export function addCannon(editor, at) {
  return addStanding(editor, 'cannon', { x: 0, y: 0, team: 'red' }, at)
}

export function addProp(editor, at, kind) {
  return addStanding(editor, 'prop', { kind, x: 0, y: 0 }, at)
}

function addStanding(editor, kind, obj, at) {
  remember(editor)
  placeOnSurface(editor.map, obj, at)
  editor.map[kind === 'cannon' ? 'cannons' : 'props'].push(obj)
  editor.selected = { kind, obj }
  return obj
}

// Cannons and props stand on the nearest top surface under the pointer.
export function placeOnSurface(map, obj, at) {
  obj.x = snap(at.x)
  obj.y = surfaceBelow(map, obj.x, at.y) ?? snap(at.y)
}

// Nothing stands on the sea.
function surfaceBelow(map, x, y) {
  const tops = [...map.solids.filter((s) => s.kind !== 'water'), ...Object.values(map.bases).map((b) => b.pad)]
    .filter((s) => x >= s.x && x <= s.x + s.w && s.y >= y - SURFACE_REACH)
    .map((s) => s.y)
  return tops.length ? Math.min(...tops) : null
}

export function minSize(item) {
  return { w: item.kind === 'pad' ? MIN_PAD_WIDTH : GRID, h: GRID }
}

// Topmost first, matching draw order.
export function itemAt(map, p) {
  const items = [
    ...map.cannons.map((obj) => ({ kind: 'cannon', obj })),
    ...map.props.map((obj) => ({ kind: 'prop', obj })).reverse(),
    ...Object.values(map.bases).map((b) => ({ kind: 'pad', obj: b.pad })),
    ...map.solids.map((obj) => ({ kind: 'solid', obj })).reverse(),
  ]
  return items.find((item) => contains(boundsOf(item), p, 0)) ?? null
}

export function boundsOf({ kind, obj }) {
  if (kind === 'prop') return propBounds(obj)
  if (kind !== 'cannon') return obj
  return { x: obj.x - CANNON_BOX.halfWidth, y: obj.y - CANNON_BOX.height, w: CANNON_BOX.halfWidth * 2, h: CANNON_BOX.height }
}

// Which edges of rect r are within tol of p: { l, r, t, b } or null.
export function edgesNear(r, p, tol) {
  if (!contains(r, p, tol)) return null
  const edges = { l: Math.abs(p.x - r.x) < tol, r: Math.abs(p.x - r.x - r.w) < tol, t: Math.abs(p.y - r.y) < tol, b: Math.abs(p.y - r.y - r.h) < tol }
  return Object.values(edges).some(Boolean) ? edges : null
}

function contains(r, p, pad) {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad
}
