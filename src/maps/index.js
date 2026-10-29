import { parseMap } from './parse.js'

// Every src/maps/*.json, keyed by file name. Make and edit them in /editor.html.
const files = import.meta.glob('./*.json', { eager: true, import: 'default' })

export const maps = Object.fromEntries(
  Object.entries(files).map(([path, raw]) => {
    const name = path.slice(2, -'.json'.length)
    return [name, parseMap(raw, name)]
  }),
)

export const DEFAULT_MAP = 'canyon'

// Dev: a map saved in the editor reloads pages that play maps, not the editor itself.
import.meta.hot?.accept(() => location.reload())
