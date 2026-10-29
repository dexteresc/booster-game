import { drawBeacon, drawLamp, drawStarburst } from './lights.js'
import { drawRadar, drawSaucer, drawTank } from './machines.js'
import { drawPalm } from './plants.js'

// Props: decoration standing on a surface at x, y. No collision: rockets fly through.
// box: how far the art reaches left, right and up from the foot, for the editor's hit box.
// New prop → a draw function in this folder, an entry here, its name in PROP_KINDS
// (maps/parse.js) and a tile in editor/palette.js.
export const PROP_ART = {
  lamp: { draw: drawLamp, box: { l: 6, r: 27, h: 68 } },
  starburst: { draw: drawStarburst, box: { l: 16, r: 16, h: 66 } },
  beacon: { draw: drawBeacon, box: { l: 8, r: 8, h: 24 } },
  tank: { draw: drawTank, box: { l: 17, r: 17, h: 48 } },
  radar: { draw: drawRadar, box: { l: 16, r: 16, h: 70 } },
  saucer: { draw: drawSaucer, box: { l: 36, r: 36, h: 34 } },
  palm: { draw: drawPalm, box: { l: 20, r: 22, h: 50 } },
}

export function drawProp(ctx, p, clock) {
  art(p).draw(ctx, p, clock)
}

export function propBounds(p) {
  const { l, r, h } = art(p).box
  return { x: p.x - l, y: p.y - h, w: l + r, h }
}

function art(p) {
  const a = PROP_ART[p.kind]
  if (!a) throw new Error(`Unknown prop kind "${p.kind}", expected one of ${Object.keys(PROP_ART)}`)
  return a
}
