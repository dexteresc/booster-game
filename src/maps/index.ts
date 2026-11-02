import type { Mode } from './parse.ts'
import { parseMap } from './parse.ts'

// Every src/maps/*.json, keyed by file name. Make and edit them in /editor.html.
const files = import.meta.glob('./*.json', { eager: true, import: 'default' })

export const maps = Object.fromEntries(
  Object.entries(files).map(([path, raw]) => {
    const name = path.slice(2, -'.json'.length)
    return [name, parseMap(raw, name)]
  }),
)

export const DEFAULT_MAP = 'canyon'

// The map in the URL if it's made for this mode, else the first one that is.
export function mapFor(wanted: Mode): string {
  const linked = new URLSearchParams(location.search).get('map')
  if (linked && maps[linked]?.mode === wanted) return linked
  if (maps[DEFAULT_MAP].mode === wanted) return DEFAULT_MAP
  const name = Object.keys(maps).find((n) => maps[n].mode === wanted)
  if (!name) throw new Error(`No ${wanted} map in src/maps/. Make one in the editor (mode: ${wanted})`)
  return name
}

// A random other map of the mode, so a session rotates through them; the same one if it's the only one.
export function anotherMap(mode: Mode, current: string): string {
  const others = Object.keys(maps).filter((n) => maps[n].mode === mode && n !== current)
  return others.length ? others[Math.floor(Math.random() * others.length)] : current
}

// Dev: a map saved in the editor reloads pages that play maps, not the editor itself.
import.meta.hot?.accept(() => location.reload())
