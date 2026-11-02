import { parseMap } from '../maps/parse.ts'
import type { Biome, GameMap, Mode } from '../maps/parse.ts'
import { BIOMES } from '../art/theme.ts'
import { byId, find } from '../dom.ts'
import {
  createEditor, flipSelected, isDirty, isFlippable, isRect, mirrorLeftHalf,
  newMap, remember, removeSelected, shapeSelected, undo,
} from './model.ts'
import type { Item, Tool } from './model.ts'
import { attachPointer } from './pointer.ts'
import { drawEditor } from './draw.ts'
import { TOOL_KEYS, buildPalette } from './palette.ts'

// Map editor: `npm run dev`, open /editor.html. Saves to src/maps/<name>.json
// through the dev server (vite.config.ts); the game picks maps up from there.

const NEW = '' // map list value for "new map"

const canvas = find<HTMLCanvasElement>(document, 'canvas')
const ui = {
  list: byId<HTMLSelectElement>('map-list'),
  name: byId<HTMLInputElement>('name'),
  mode: byId<HTMLSelectElement>('mode'),
  biome: byId<HTMLSelectElement>('biome'),
  width: byId<HTMLInputElement>('width'),
  height: byId<HTMLInputElement>('height'),
  gravity: byId<HTMLInputElement>('gravity'),
  palette: byId<HTMLDivElement>('palette'),
  tools: () => [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')],
  flip: byId<HTMLButtonElement>('flip'),
  shape: byId<HTMLButtonElement>('shape'),
  remove: byId<HTMLButtonElement>('delete'),
  undo: byId<HTMLButtonElement>('undo'),
  mirror: byId<HTMLButtonElement>('mirror'),
  save: byId<HTMLButtonElement>('save'),
  play: byId<HTMLAnchorElement>('play'),
  info: byId<HTMLDivElement>('info'),
  status: byId<HTMLParagraphElement>('status'),
}

// Before the first load sets it.
ui.biome.replaceChildren(...Object.entries(BIOMES).map(([name, b]) => new Option(b.label, name)))

let maps: Record<string, GameMap> = {} // name → map as last saved
let paletteBiome: Biome | null = null // biome the tool tiles were drawn for
const editor = createEditor(null, newMap())
let hover = { x: 0, y: 0 }

start().catch((err: unknown) => {
  console.error('Map editor failed to start', err)
  showStatus(errorText(err), true)
})

async function start(): Promise<void> {
  maps = await fetchMaps()
  const wanted = new URLSearchParams(location.search).get('map')
  load(wanted !== null && wanted in maps ? wanted : (Object.keys(maps)[0] ?? NEW))
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

async function fetchMaps(): Promise<Record<string, GameMap>> {
  const res = await fetch('/__maps/')
  if (!res.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('Map editor needs the dev server for loading and saving: run `npm run dev`, open /editor.html')
  }
  const body = await res.json()
  if (!res.ok) throw new Error(`Loading maps failed: ${body.error}`)
  return Object.fromEntries(Object.entries(body).map(([name, raw]) => [name, parseMap(raw, name)]))
}

function load(name: string): void {
  Object.assign(editor, createEditor(name || null, name ? maps[name] : newMap()))
  const box = canvas.getBoundingClientRect() // zoom to fit
  editor.view.zoom = Math.min(box.width / editor.map.width, box.height / editor.map.height) * 0.95
  ui.name.value = name
  history.replaceState(null, '', name ? `?map=${name}` : location.pathname)
  refreshList()
  refresh()
  if (!name) ui.name.focus()
}

function bindPanel(): void {
  ui.list.onchange = () => {
    if (!isDirty(editor) || confirm('Discard unsaved changes?')) load(ui.list.value)
    else ui.list.value = editor.name ?? NEW
  }
  ui.mode.onchange = () => edit(() => setMode(ui.mode.value as Mode))
  ui.biome.onchange = () => edit(() => setBiome(ui.biome.value as Biome))
  ui.width.onchange = () => setMapNumber('width', ui.width)
  ui.height.onchange = () => setMapNumber('height', ui.height)
  ui.gravity.onchange = () => setMapNumber('gravity', ui.gravity)
  ui.palette.onclick = (e) => {
    const button = e.target instanceof Element && e.target.closest<HTMLElement>('[data-tool]')
    if (button) setTool(button.dataset.tool as Tool) // palette tiles are only ever built with a Tool
  }
  find<HTMLButtonElement>(document, '[data-tool="select"]').onclick = () => setTool('select')
  ui.flip.onclick = () => edit(() => flipSelected(editor))
  ui.shape.onclick = () => edit(() => shapeSelected(editor))
  ui.remove.onclick = () => edit(() => removeSelected(editor))
  ui.undo.onclick = () => edit(() => undo(editor))
  ui.mirror.onclick = () => edit(() => mirrorLeftHalf(editor))
  ui.save.onclick = save
}

function inField(e: KeyboardEvent): boolean {
  return e.target instanceof Element && e.target.closest('input, select') !== null
}

function onKey(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey) onShortcut(e)
  else if (!inField(e)) onPlainKey(e)
}

// Cmd/Ctrl+S saves even while typing a name.
function onShortcut(e: KeyboardEvent): void {
  if (e.code === 'KeyS') {
    e.preventDefault()
    save().catch((err: unknown) => {
      console.error('Save failed', err)
      showStatus(String(err), true)
    })
  }
  if (e.code === 'KeyZ' && !inField(e)) {
    e.preventDefault()
    edit(() => undo(editor))
  }
}

function onPlainKey(e: KeyboardEvent): void {
  const tool = TOOL_KEYS[e.code]
  if (tool) setTool(tool)
  if (e.code === 'KeyF') edit(() => flipSelected(editor))
  if (e.code === 'KeyO') edit(() => shapeSelected(editor))
  if (e.code === 'Delete' || e.code === 'Backspace') edit(() => removeSelected(editor))
  if (e.code === 'Escape') edit(() => { editor.selected = null })
}

function edit(change: () => void): void {
  change()
  refresh()
}

function setTool(tool: Tool): void {
  editor.tool = tool
  refresh()
}

function setMode(mode: Mode): void {
  remember(editor)
  editor.map.mode = mode
}

// Re-skins rock, hills and weather; blocks the biome doesn't offer stay as they are.
function setBiome(biome: Biome): void {
  remember(editor)
  editor.map.biome = biome
}

// Gravity 1 is the default, so it's left out of the file.
function setMapNumber(key: 'width' | 'height' | 'gravity', input: HTMLInputElement): void {
  const value = Number(input.value)
  if (!(value > 0)) {
    showStatus(`Map ${key} must be a positive number, got "${input.value}"`, true)
    input.value = String(editor.map[key] ?? 1)
    return
  }
  remember(editor)
  if (key === 'gravity' && value === 1) delete editor.map.gravity
  else editor.map[key] = value
  refresh()
}

async function save(): Promise<void> {
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
    showStatus(`Not saved: ${errorText(err)}`, true)
    return
  }
  maps[name] = structuredClone(editor.map)
  Object.assign(editor, { name, saved: JSON.stringify(editor.map) })
  history.replaceState(null, '', `?map=${name}`)
  refreshList()
  refresh()
  showStatus(`Saved src/maps/${name}.json`)
}

function refreshList(): void {
  const options = Object.keys(maps).map((name) => new Option(name, name))
  ui.list.replaceChildren(...options, new Option('+ new map', NEW))
  ui.list.value = editor.name ?? NEW
}

function refresh(): void {
  const { map, selected, tool, name, history: undoable } = editor
  if (document.activeElement !== ui.width) ui.width.value = String(map.width)
  if (document.activeElement !== ui.height) ui.height.value = String(map.height)
  if (document.activeElement !== ui.gravity) ui.gravity.value = String(map.gravity ?? 1)
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

function refreshSelectionButtons(selected: Item | null): void {
  ui.flip.disabled = !isFlippable(selected)
  ui.shape.disabled = selected?.kind !== 'solid'
  ui.remove.disabled = !selected || selected.kind === 'pad'
}

// Tool tiles follow the biome; a tool the biome doesn't offer falls back to select.
function refreshTools(biome: Biome, tool: Tool): void {
  if (paletteBiome !== biome) {
    paletteBiome = biome
    ui.biome.value = biome
    buildPalette(ui.palette, biome)
    if (!ui.tools().some((b) => b.dataset.tool === tool)) editor.tool = 'select'
  }
  for (const button of ui.tools()) button.setAttribute('aria-pressed', String(button.dataset.tool === editor.tool))
}

function refreshInfo(): void {
  const { selected } = editor
  const at = `x ${Math.round(hover.x)}  y ${Math.round(hover.y)}`
  ui.info.textContent = selected ? `${at}\n${describe(selected)}` : at
}

function describe(item: Item): string {
  const { obj } = item
  const size = isRect(item) ? ` ${item.obj.w}×${item.obj.h}` : ''
  const shape = item.kind === 'solid' && item.obj.shape ? `${item.obj.shape} ` : ''
  const flipped = item.kind === 'prop' && item.obj.flip ? ' (flipped)' : ''
  const hanging = item.kind === 'cannon' && item.obj.hang ? ' (hanging)' : ''
  return `${shape}${itemName(item)}${flipped}${hanging} at ${obj.x}, ${obj.y}${size}`
}

function itemName(item: Item): string {
  if (item.kind === 'cannon') return item.kind
  return item.obj.kind ?? (item.kind === 'solid' ? 'rock' : item.kind)
}

// Not errorMessage from net.ts: that would pull peerjs into the editor.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function showStatus(text: string, error = false): void {
  ui.status.textContent = text
  ui.status.classList.toggle('error', error)
}
