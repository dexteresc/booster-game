import { context2d } from '../dom.ts'

// Screen-space finish over the world, under the HUD: bloom, so bright things (flames, lasers, lights,
// stars) glow onto what's around them, and a vignette that pulls the eye to the middle.

type Size = { w: number; h: number }

const BLOOM_SCALE = 4 // bloom is worked out at 1/4 resolution
const BLUR_SCALE = 4 // and softened by bouncing it through a buffer another 1/4 smaller
const THRESHOLD_PASSES = 2 // the buffer multiplied by itself this many times: dark goes black, bright stays
const VIGNETTE = 0.42 // edge darkness

export function createPost() {
  const bctx = context2d(document.createElement('canvas'))
  const blurCtx = context2d(document.createElement('canvas'))
  let vignette: (Size & { fill: CanvasGradient }) | null = null

  // strength: 0..1, how much bloom is added back.
  return function finish(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
    if (!w || !h) return // not laid out yet: an empty canvas can't be drawn from
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (strength > 0) bloom(ctx, [bctx, blurCtx], { w, h }, strength)
    if (vignette?.w !== w || vignette.h !== h) vignette = { w, h, fill: vignetteFill(ctx, w, h) }
    ctx.fillStyle = vignette.fill
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
}

// No canvas filters: they're rasterized on the CPU in some browsers and cost a dozen frames a second.
// Compositing is cheap: multiplying the small frame by itself keeps only what's bright, and scaling it
// down and back up with smoothing on blurs it.
type Buffers = [small: CanvasRenderingContext2D, tiny: CanvasRenderingContext2D]

function bloom(ctx: CanvasRenderingContext2D, [small, tiny]: Buffers, { w, h }: Size, strength: number) {
  fit(small.canvas, w / BLOOM_SCALE, h / BLOOM_SCALE)
  fit(tiny.canvas, small.canvas.width / BLUR_SCALE, small.canvas.height / BLUR_SCALE)
  copy(small, ctx.canvas)
  small.globalCompositeOperation = 'multiply'
  for (let i = 0; i < THRESHOLD_PASSES; i++) small.drawImage(small.canvas, 0, 0)
  copy(tiny, small.canvas)
  copy(small, tiny.canvas)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = strength
  ctx.drawImage(small.canvas, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function fit(canvas: HTMLCanvasElement, w: number, h: number) {
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

// Replaces the target with the source, scaled to fit, smoothed.
function copy(target: CanvasRenderingContext2D, source: HTMLCanvasElement) {
  target.globalCompositeOperation = 'copy'
  target.imageSmoothingEnabled = true
  target.drawImage(source, 0, 0, target.canvas.width, target.canvas.height)
  target.globalCompositeOperation = 'source-over'
}

function vignetteFill(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${VIGNETTE})`)
  return g
}
