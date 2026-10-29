import { parseMap } from '../maps/parse.js'
import { createEditor, isDirty, isRect, newMap, remember, removeSelected, undo } from './model.js'
import { attachPointer } from './pointer.js'
import { drawEditor } from './draw.js'
import { TOOL_KEYS, buildPalette } from './palette.js'

// Map editor: `npm run dev`, open /editor.html. Saves to src/maps/<name>.json
// through the dev server (vite.config.js); the game picks maps up from there.

const NEW = '' // map list value for "new map"

const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas')
buildPalette($('palette'))
const ui = {
  list: $('map-list'),
  name: $('name'),
  width: $('width'),
  height: $('height'),
  tools: [...document.querySelectorAll('[data-tool]')],
  remove: $('delete'),
  undo: $('undo'),
  save: $('save'),
  play: $('play'),
  info: $('info'),
  status: $('status'),
}

let maps = {} // name → map as last saved
const editor = createEditor(null, newMap())
let hover = { x: 0, y: 0 }

start().catch((err) => {
  console.error('Map editor failed to start', err)
  showStatus(err.message, true)
})

async function start() {
  maps = await fetchMaps()
  const wanted = new URLSearchParams(location.search).get('map')
  load(wanted in maps ? wanted : (Object.keys(maps)[0] ?? NEW))
  attachPointer(canvas, editor, {
    onChange: refresh,
    onHover: (p) => {
      hover = p
      refreshInfo()
    },
  })
  bindPanel()
  addEventListener('keydown', onKey)
  addEventListener('beforeunload', (e) => isDirty(editor) && e.preventDefault())
  requestAnimationFrame(function frame(now) {
    drawEditor(canvas, editor, now / 1000)
    requestAnimationFrame(frame)
  })
}

async function fetchMaps() {
  const res = await fetch('/__maps/')
  if (!res.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('Map editor needs the dev server for loading and saving: run `npm run dev`, open /editor.html')
  }
  const body = await res.json()
  if (!res.ok) throw new Error(`Loading maps failed: ${body.error}`)
  return Object.fromEntries(Object.entries(body).map(([name, raw]) => [name, parseMap(raw, name)]))
}

function load(name) {
  Object.assign(editor, createEditor(name || null, name ? maps[name] : newMap()))
  const box = canvas.getBoundingClientRect() // zoom to fit
  editor.view.zoom = Math.min(box.width / editor.map.width, box.height / editor.map.height) * 0.95
  ui.name.value = name
  history.replaceState(null, '', name ? `?map=${name}` : location.pathname)
  refreshList()
  refresh()
  if (!name) ui.name.focus()
}

function bindPanel() {
  ui.list.onchange = () => {
    if (!isDirty(editor) || confirm('Discard unsaved changes?')) load(ui.list.value)
    else ui.list.value = editor.name ?? NEW
  }
  ui.width.onchange = () => resizeMap('width', ui.width)
  ui.height.onchange = () => resizeMap('height', ui.height)
  for (const button of ui.tools) button.onclick = () => setTool(button.dataset.tool)
  ui.remove.onclick = () => edit(() => removeSelected(editor))
  ui.undo.onclick = () => edit(() => undo(editor))
  ui.save.onclick = save
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey) onShortcut(e)
  else if (!e.target.closest('input, select')) onPlainKey(e)
}

// Cmd/Ctrl+S saves even while typing a name.
function onShortcut(e) {
  if (e.code === 'KeyS') {
    e.preventDefault()
    save()
  }
  if (e.code === 'KeyZ' && !e.target.closest('input, select')) {
    e.preventDefault()
    edit(() => undo(editor))
  }
}

function onPlainKey(e) {
  if (TOOL_KEYS[e.code]) setTool(TOOL_KEYS[e.code])
  if (e.code === 'Delete' || e.code === 'Backspace') edit(() => removeSelected(editor))
  if (e.code === 'Escape') edit(() => (editor.selected = null))
}

function edit(change) {
  change()
  refresh()
}

function setTool(tool) {
  editor.tool = tool
  refresh()
}

function resizeMap(key, input) {
  const value = Number(input.value)
  if (!(value > 0)) {
    showStatus(`Map ${key} must be a positive number, got "${input.value}"`, true)
    input.value = editor.map[key]
    return
  }
  remember(editor)
  editor.map[key] = value
  refresh()
}

async function save() {
  const name = ui.name.value.trim()
  if (name !== editor.name && maps[name] && !confirm(`Overwrite map "${name}"?`)) return
  try {
    const res = await fetch(`/__maps/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editor.map),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error)
  } catch (err) {
    console.error(`Saving map "${name}" failed`, err)
    showStatus(`Not saved: ${err.message}`, true)
    return
  }
  maps[name] = structuredClone(editor.map)
  Object.assign(editor, { name, saved: JSON.stringify(editor.map) })
  history.replaceState(null, '', `?map=${name}`)
  refreshList()
  refresh()
  showStatus(`Saved src/maps/${name}.json`)
}

function refreshList() {
  const options = Object.keys(maps).map((name) => new Option(name, name))
  ui.list.replaceChildren(...options, new Option('+ new map', NEW))
  ui.list.value = editor.name ?? NEW
}

function refresh() {
  const { map, selected, tool, name, history: undoable } = editor
  if (document.activeElement !== ui.width) ui.width.value = map.width
  if (document.activeElement !== ui.height) ui.height.value = map.height
  for (const button of ui.tools) button.setAttribute('aria-pressed', button.dataset.tool === tool)
  ui.remove.disabled = !selected || selected.kind === 'pad'
  ui.undo.disabled = !undoable.length
  ui.play.hidden = !name
  if (name) ui.play.href = `./?map=${encodeURIComponent(name)}`
  document.title = `${isDirty(editor) ? '• ' : ''}${name ?? 'new map'} · Booster map editor`
  refreshInfo()
}

function refreshInfo() {
  const { selected } = editor
  const at = `x ${Math.round(hover.x)}  y ${Math.round(hover.y)}`
  ui.info.textContent = selected ? `${at}\n${describe(selected)}` : at
}

function describe(item) {
  const { kind, obj } = item
  const what = obj.kind ?? (kind === 'solid' ? 'rock' : kind)
  const size = isRect(item) ? ` ${obj.w}×${obj.h}` : ''
  return `${what} at ${obj.x}, ${obj.y}${size}`
}

function showStatus(text, error = false) {
  ui.status.textContent = text
  ui.status.classList.toggle('error', error)
}
