import { TAU } from './brush.js'

// A planet lit from the sun's side. kind 'giant': banded, with a storm spot and rings; 'moon': plain.
export function drawPlanet(ctx, p, sky, { width, height }) {
  const body = { x: p.x * width, y: p.y * height, r: p.r, tilt: -0.35 }
  const sun = sky.suns[0]
  const toSun = Math.atan2(sun.y * height - body.y, sun.x * width - body.x)
  if (p.kind === 'giant') drawRing(ctx, body, 'back')
  ctx.save()
  ctx.beginPath()
  ctx.arc(body.x, body.y, p.r, 0, TAU)
  ctx.clip()
  if (p.kind === 'giant') paintBands(ctx, p, body)
  else {
    ctx.fillStyle = p.color
    ctx.fillRect(body.x - p.r, body.y - p.r, p.r * 2, p.r * 2)
  }
  nightSide(ctx, body, toSun)
  ctx.restore()
  if (p.kind === 'giant') drawRing(ctx, body, 'front')
}

function paintBands(ctx, p, { x, y, r, tilt }) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt * 0.4)
  const rows = p.bands.length * 2
  const band = (r * 2) / rows
  for (let i = 0; i < rows; i++) {
    ctx.fillStyle = p.bands[(i * 7) % p.bands.length]
    ctx.fillRect(-r * 1.2, -r + i * band, r * 2.4, band + 1)
  }
  ctx.fillStyle = p.spot
  ctx.beginPath()
  ctx.ellipse(r * 0.25, r * 0.3, r * 0.18, r * 0.09, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

// Lit toward the sun, falling off into a dark night side.
function nightSide(ctx, { x, y, r }, toSun) {
  const lx = x + Math.cos(toSun) * r * 0.55
  const ly = y + Math.sin(toSun) * r * 0.55
  const shade = ctx.createRadialGradient(lx, ly, r * 0.2, lx, ly, r * 1.7)
  shade.addColorStop(0, 'rgba(255,250,235,0.12)')
  shade.addColorStop(0.45, 'rgba(0,0,8,0)')
  shade.addColorStop(0.8, 'rgba(2,2,12,0.85)')
  shade.addColorStop(1, 'rgba(2,2,12,0.97)')
  ctx.fillStyle = shade
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

// half: 'back' is the arc behind the planet, 'front' the one crossing in front of it.
function drawRing(ctx, { x, y, r, tilt }, half) {
  const [from, to] = half === 'back' ? [Math.PI, TAU] : [0, Math.PI]
  for (const [scale, width, color] of [[1.55, 6, 'rgba(230,205,170,0.55)'], [1.75, 10, 'rgba(200,170,135,0.45)'], [2.0, 5, 'rgba(240,220,190,0.3)']]) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(x, y, r * scale, r * scale * 0.28, tilt, from, to)
    ctx.stroke()
  }
}
