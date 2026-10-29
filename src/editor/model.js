// Editor state and edits on it. No DOM here.
// An item is { kind: 'solid' | 'pad' | 'cannon', obj } where obj lives inside editor.map.

export const GRID = 10
const MIN_PAD_WIDTH = 40
const CANNON_BOX = { halfWidth: 14, height: 30 }
const SURFACE_REACH = 40 // a cannon dropped this far below a top edge still lands on it

export function createEditor(name, map) {
  return {
    name, // file name, null until first save
    map: structuredClone(map),
    saved: JSON.stringify(map),
    tool: 'select', // select | rock | water | cannon
    selected: null,
    view: { x: map.width / 2, y: map.height / 2, zoom: 1 },
    history: [], // JSON of map before each edit
  }
}

export function newMap() {
  return {
    width: 3200,
    height: 1400,
    solids: [{ x: 0, y: 1300, w: 3200, h: 100, water: true }],
    bases: { blue: { pad: { x: 120, y: 1240, w: 240, h: 60 } }, red: { pad: { x: 2840, y: 1240, w: 240, h: 60 } } },
    cannons: [],
  }
}

export const isDirty = (editor) => JSON.stringify(editor.map) !== editor.saved

export const snap = (v) => Math.round(v / GRID) * GRID

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
  editor.selected = null
}

export function addRect(editor, at, water) {
  remember(editor)
  const rect = { x: snap(at.x), y: snap(at.y), w: 0, h: 0, ...(water && { water: true }) }
  editor.map.solids.push(rect)
  editor.selected = { kind: 'solid', obj: rect }
  return rect
}

export function addCannon(editor, at) {
  remember(editor)
  const cannon = { x: 0, y: 0, team: 'red' }
  placeCannon(editor.map, cannon, at)
  editor.map.cannons.push(cannon)
  editor.selected = { kind: 'cannon', obj: cannon }
  return cannon
}

// Cannon stands on the nearest top surface under the pointer.
export function placeCannon(map, cannon, at) {
  cannon.x = snap(at.x)
  cannon.y = surfaceBelow(map, cannon.x, at.y) ?? snap(at.y)
}

function surfaceBelow(map, x, y) {
  const tops = [...map.solids, ...Object.values(map.bases).map((b) => b.pad)]
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
    ...Object.values(map.bases).map((b) => ({ kind: 'pad', obj: b.pad })),
    ...map.solids.map((obj) => ({ kind: 'solid', obj })).reverse(),
  ]
  return items.find((item) => contains(boundsOf(item), p, 0)) ?? null
}

export function boundsOf({ kind, obj }) {
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
