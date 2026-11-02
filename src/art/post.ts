// Screen-space finish over the world, under the HUD: bloom, so bright things (flames, lasers, lights,
// stars) glow onto what's around them, and a vignette that pulls the eye to the middle.

type Size = { w: number; h: number }

const BLOOM_SCALE = 4 // bloom is worked out at 1/4 resolution, which also softens it
const BLOOM_PASS = 'brightness(0.6) contrast(5) blur(3px)' // keeps only the brightest pixels, then spreads them
const VIGNETTE = 0.42 // edge darkness

export function createPost() {
  const buffer = document.createElement('canvas')
  const bctx = buffer.getContext('2d')
  if (!bctx) throw new Error('2d canvas unavailable')
  bctx.filter = 'blur(1px)'
  const canFilter = bctx.filter === 'blur(1px)' // without canvas filters bloom would wash out the whole frame
  bctx.filter = 'none'
  let vignette: (Size & { fill: CanvasGradient }) | null = null

  // strength: 0..1, how much bloom is added back.
  return function finish(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
    if (!w || !h) return // not laid out yet: an empty canvas can't be drawn from
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (canFilter && strength > 0) bloom(ctx, bctx, { w, h }, strength)
    if (vignette?.w !== w || vignette.h !== h) vignette = { w, h, fill: vignetteFill(ctx, w, h) }
    ctx.fillStyle = vignette.fill
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
}

function bloom(ctx: CanvasRenderingContext2D, bctx: CanvasRenderingContext2D, { w, h }: Size, strength: number) {
  const buffer = bctx.canvas
  const bw = Math.ceil(w / BLOOM_SCALE)
  const bh = Math.ceil(h / BLOOM_SCALE)
  if (buffer.width !== bw || buffer.height !== bh) {
    buffer.width = bw
    buffer.height = bh
  }
  bctx.clearRect(0, 0, bw, bh)
  bctx.filter = BLOOM_PASS
  bctx.drawImage(ctx.canvas, 0, 0, bw, bh)
  bctx.filter = 'none'
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = strength
  ctx.drawImage(buffer, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function vignetteFill(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${VIGNETTE})`)
  return g
}
