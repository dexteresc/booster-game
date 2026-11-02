import { parseMap } from '../maps/parse.js'
import { BIOMES } from '../art/theme.js'
import { createEditor, flipSelected, isDirty, isFlippable, isRect, mirrorLeftHalf, newMap, remember, removeSelected, shapeSelected, undo } from './model.js'
import { attachPointer } from './pointer.js'
import { drawEditor } from './draw.js'
import { TOOL_KEYS, buildPalette } from './palette.js'

// Map editor: `npm run dev`, open /editor.html. Saves to src/maps/<name>.json
// through the dev server (vite.config.js); the game picks maps up from there.

const NEW = '' // map list value for "new map"

const $ = (id) => document.getElementById(id)
const canvas = document.querySelector('canvas')
const ui = {
  list: $('map-list'),
  name: $('name'),
  mode: $('mode'),
  biome: $('biome'),
  width: $('width'),
  height: $('height'),
  gravity: $('gravity'),
  palette: $('palette'),
  tools: () => [...document.querySelectorAll('[data-tool]')],
  flip: $('flip'),
  shape: $('shape'),
  remove: $('delete'),
  undo: $('undo'),
  mirror: $('mirror'),
  save: $('save'),
  play: $('play'),
  info: $('info'),
  status: $('status'),
}

ui.biome.replaceChildren(...Object.entries(BIOMES).map(([name, b]) => new Option(b.label, name))) // before the first load sets it

let maps = {} // name → map as last saved
let paletteBiome = null // biome the tool tiles were drawn for
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
  ui.mode.onchange = () => edit(() => setMode(ui.mode.value))
  ui.biome.onchange = () => edit(() => setBiome(ui.biome.value))
  ui.width.onchange = () => setMapNumber('width', ui.width)
  ui.height.onchange = () => setMapNumber('height', ui.height)
  ui.gravity.onchange = () => setMapNumber('gravity', ui.gravity, 1)
  ui.palette.onclick = (e) => {
    const button = e.target.closest('[data-tool]')
    if (button) setTool(button.dataset.tool)
  }
  ui.tools().find((b) => b.dataset.tool === 'select').onclick = () => setTool('select')
  ui.flip.onclick = () => edit(() => flipSelected(editor))
  ui.shape.onclick = () => edit(() => shapeSelected(editor))
  ui.remove.onclick = () => edit(() => removeSelected(editor))
  ui.undo.onclick = () => edit(() => undo(editor))
  ui.mirror.onclick = () => edit(() => mirrorLeftHalf(editor))
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
  if (e.code === 'KeyF') edit(() => flipSelected(editor))
  if (e.code === 'KeyO') edit(() => shapeSelected(editor))
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

function setMode(mode) {
  remember(editor)
  editor.map.mode = mode
}

// Re-skins rock, hills and weather; blocks the biome doesn't offer stay as they are.
function setBiome(biome) {
  remember(editor)
  editor.map.biome = biome
}

// A value equal to `fallback` is the default, so it's left out of the file.
function setMapNumber(key, input, fallback) {
  const value = Number(input.value)
  if (!(value > 0)) {
    showStatus(`Map ${key} must be a positive number, got "${input.value}"`, true)
    input.value = editor.map[key] ?? fallback
    return
  }
  remember(editor)
  if (value === fallback) delete editor.map[key]
  else editor.map[key] = value
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
  if (document.activeElement !== ui.gravity) ui.gravity.value = map.gravity ?? 1
  ui.mode.value = map.mode
  refreshTools(map.biome, tool)
  refreshSelectionButtons(selected)
  ui.undo.disabled = !undoable.length
  ui.mirror.disabled = map.mode !== 'pvp'
  ui.play.hidden = !name
  if (name) ui.play.href = `./?map=${encodeURIComponent(name)}`
  document.title = `${isDirty(editor) ? '• ' : ''}${name ?? 'new map'} · Booster map editor`
  refreshInfo()
}

function refreshSelectionButtons(selected) {
  ui.flip.disabled = !isFlippable(selected)
  ui.shape.disabled = selected?.kind !== 'solid'
  ui.remove.disabled = !selected || selected.kind === 'pad'
}

// Tool tiles follow the biome; a tool the biome doesn't offer falls back to select.
function refreshTools(biome, tool) {
  if (paletteBiome !== biome) {
    paletteBiome = biome
    ui.biome.value = biome
    buildPalette(ui.palette, biome)
    if (!ui.tools().some((b) => b.dataset.tool === tool)) editor.tool = 'select'
  }
  for (const button of ui.tools()) button.setAttribute('aria-pressed', button.dataset.tool === editor.tool)
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
  return `${obj.shape ? `${obj.shape} ` : ''}${what}${obj.flip ? ' (flipped)' : ''}${obj.hang ? ' (hanging)' : ''} at ${obj.x}, ${obj.y}${size}`
}

function showStatus(text, error = false) {
  ui.status.textContent = text
  ui.status.classList.toggle('error', error)
}
