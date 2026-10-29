import { addCannon, addRect, edgesNear, forgetIfUnchanged, itemAt, minSize, placeCannon, remember, snap } from './model.js'

// Mouse / pen / touch on the map. Select tool: drag to move, drag an edge to resize,
// drag empty space to pan. Rock / water: drag out a rect. Cannon: click a surface.
// Right or middle drag always pans. Scroll pans, pinch or ctrl+scroll zooms.

const EDGE_PX = 8 // grab distance for resize edges, in screen pixels
const ZOOM_LIMITS = [0.05, 4]
const CURSORS = { lr: 'ew-resize', tb: 'ns-resize', lt: 'nwse-resize', rb: 'nwse-resize', rt: 'nesw-resize', lb: 'nesw-resize' }

// onChange(): something moved, the panel may need updating. onHover(worldPoint).
export function attachPointer(canvas, editor, { onChange, onHover }) {
  let drag = null

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    drag = startDrag(editor, e, toWorld(canvas, editor.view, e))
    onChange()
  })
  canvas.addEventListener('pointermove', (e) => {
    const p = toWorld(canvas, editor.view, e)
    onHover(p)
    if (drag) {
      moveDrag(editor, drag, e, p)
      onChange()
    } else {
      canvas.style.cursor = hoverCursor(editor, p)
    }
  })
  const end = () => {
    if (drag) endDrag(editor, drag)
    drag = null
    onChange()
  }
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)
  canvas.addEventListener('wheel', (e) => wheel(canvas, editor.view, e), { passive: false })
}

function startDrag(editor, e, p) {
  const pan = { kind: 'pan', from: { x: e.clientX, y: e.clientY }, start: { ...editor.view } }
  if (e.button !== 0) return pan
  if (editor.tool === 'rock' || editor.tool === 'water') {
    const rect = addRect(editor, p, editor.tool === 'water')
    return { kind: 'resize', item: editor.selected, start: { ...rect }, edges: { r: true, b: true }, created: true }
  }
  if (editor.tool === 'cannon') {
    addCannon(editor, p)
    return { kind: 'cannon', item: editor.selected }
  }
  return selectDrag(editor, p) ?? pan
}

function selectDrag(editor, p) {
  const { selected } = editor
  const edges = selected && selected.kind !== 'cannon' && edgesNear(selected.obj, p, EDGE_PX / editor.view.zoom)
  if (edges) {
    remember(editor)
    return { kind: 'resize', item: selected, start: { ...selected.obj }, edges }
  }
  editor.selected = itemAt(editor.map, p)
  if (!editor.selected) return null
  remember(editor)
  const { kind, obj } = editor.selected
  return { kind: kind === 'cannon' ? 'cannon' : 'move', item: editor.selected, from: p, start: { x: obj.x, y: obj.y } }
}

function moveDrag(editor, drag, e, p) {
  const { obj } = drag.item ?? {}
  if (drag.kind === 'pan') {
    editor.view.x = drag.start.x - (e.clientX - drag.from.x) / editor.view.zoom
    editor.view.y = drag.start.y - (e.clientY - drag.from.y) / editor.view.zoom
  }
  if (drag.kind === 'move') Object.assign(obj, { x: snap(drag.start.x + p.x - drag.from.x), y: snap(drag.start.y + p.y - drag.from.y) })
  if (drag.kind === 'cannon') placeCannon(editor.map, obj, p)
  if (drag.kind === 'resize') resize(drag, p)
}

// Edges follow the pointer; dragging past the opposite edge flips the rect.
function resize({ item, start, edges, created }, p) {
  let [l, r, t, b] = [start.x, start.x + start.w, start.y, start.y + start.h]
  if (edges.l) l = snap(p.x)
  if (edges.r) r = snap(p.x)
  if (edges.t) t = snap(p.y)
  if (edges.b) b = snap(p.y)
  const min = created ? { w: 0, h: 0 } : minSize(item)
  Object.assign(item.obj, { x: Math.min(l, r), y: Math.min(t, b), w: Math.max(Math.abs(r - l), min.w), h: Math.max(Math.abs(b - t), min.h) })
}

// A click with a rect tool (no drag) leaves a zero-size rect: drop it.
function endDrag(editor, drag) {
  if (drag.kind === 'pan') return
  const { obj } = drag.item
  if (drag.created && (obj.w === 0 || obj.h === 0)) {
    editor.map.solids.splice(editor.map.solids.indexOf(obj), 1)
    editor.selected = null
  }
  forgetIfUnchanged(editor)
}

function hoverCursor(editor, p) {
  const { selected, tool, view } = editor
  if (tool !== 'select') return 'crosshair'
  const edges = selected && selected.kind !== 'cannon' && edgesNear(selected.obj, p, EDGE_PX / view.zoom)
  if (edges) return CURSORS[Object.keys(edges).filter((k) => edges[k]).join('')] ?? 'move'
  return itemAt(editor.map, p) ? 'move' : 'grab'
}

function wheel(canvas, view, e) {
  e.preventDefault()
  if (!e.ctrlKey && !e.metaKey) {
    view.x += e.deltaX / view.zoom
    view.y += e.deltaY / view.zoom
    return
  }
  // Zoom around the pointer: the world point under it stays put.
  const before = toWorld(canvas, view, e)
  view.zoom = Math.min(Math.max(view.zoom * Math.exp(-e.deltaY * 0.01), ZOOM_LIMITS[0]), ZOOM_LIMITS[1])
  const after = toWorld(canvas, view, e)
  view.x += before.x - after.x
  view.y += before.y - after.y
}

// view.x, view.y: world point at the canvas center. zoom: CSS pixels per world unit.
export function toWorld(canvas, view, e) {
  const box = canvas.getBoundingClientRect()
  return { x: view.x + (e.clientX - box.left - box.width / 2) / view.zoom, y: view.y + (e.clientY - box.top - box.height / 2) / view.zoom }
}
