import { PROP_KINDS, SOLID_KINDS } from '../maps/parse.js'
import { drawPreview } from './draw.js'

// Tool tiles in the side panel: a picture of each thing you can place, drawn with the real art.
// Blocks are dragged out as rects; props (and cannons) are dropped onto a surface.
const GROUPS = [
  ['Blocks', ['rock', ...SOLID_KINDS]],
  ['Props', ['cannon', ...PROP_KINDS]],
]
const KEYS = { rock: 'R', water: 'W', concrete: 'K', metal: 'M', cannon: 'C', lamp: 'L' }

// e.code → tool, for keyboard shortcuts. V is the select tool.
export const TOOL_KEYS = { KeyV: 'select', ...Object.fromEntries(Object.entries(KEYS).map(([tool, key]) => [`Key${key}`, tool])) }

export function buildPalette(container) {
  for (const [title, tools] of GROUPS) {
    const heading = document.createElement('h2')
    heading.textContent = title
    const grid = document.createElement('div')
    grid.className = 'tiles'
    grid.append(...tools.map(tile))
    container.append(heading, grid)
    // Draw once laid out: a canvas outside the document has no size.
    for (const button of grid.children) drawPreview(button.querySelector('canvas'), button.dataset.tool)
  }
}

function tile(tool) {
  const button = document.createElement('button')
  button.dataset.tool = tool
  button.title = `${label(tool)} tool${KEYS[tool] ? ` (${KEYS[tool]})` : ''}`
  const canvas = document.createElement('canvas')
  const name = document.createElement('span')
  name.textContent = label(tool)
  if (KEYS[tool]) {
    const key = document.createElement('kbd')
    key.textContent = KEYS[tool]
    name.append(key)
  }
  button.append(canvas, name)
  return button
}

const label = (tool) => tool[0].toUpperCase() + tool.slice(1)
