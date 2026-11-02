import type { Skin, SkinPart } from './art/skins.ts'
import type { GoalId, Stats } from './progress.ts'
import { config } from './config.ts'
import { SKINS, SKIN_PARTS } from './art/skins.ts'
import { SKIES } from './art/theme.ts'
import { fitCanvas } from './art/brush.ts'
import { drawRocket } from './art/sprites.ts'
import { createTrails } from './art/trail.ts'
import { GOALS, progressText, reached } from './progress.ts'
import { context2d, find } from './dom.ts'

// Appearance dialog, opened from the menu: one row of buttons per skin part, a live preview of the result,
// and a line that says what unlocks a locked option when it's clicked. Locked options stay visible: they're the carrot.

const PREVIEW = { w: 120, h: 110 } // world units; the rocket sits high so its trail has room to fall
const ROCKET_Y = 40

export function createSkinPicker(dialog: HTMLDialogElement, skin: Skin, stats: Stats, onChange: (skin: Skin) => void) {
  const rows = find<HTMLElement>(dialog, '.skin-parts')
  const hint = find<HTMLElement>(dialog, '.skin-hint')
  const canvas = find<HTMLCanvasElement>(dialog, 'canvas')
  const trails = createTrails()

  const pick = (part: SkinPart, id: string) => {
    const option = SKINS[part][id as keyof (typeof SKINS)[SkinPart]] as { label: string; unlock: GoalId | null }
    if (option.unlock && !reached(option.unlock, stats)) {
      hint.textContent = `${option.label}: ${GOALS[option.unlock].label} (${progressText(option.unlock, stats)})`
      return
    }
    ;(skin as Record<SkinPart, string>)[part] = id
    hint.textContent = ''
    onChange(skin)
    render()
  }
  const render = () => rows.replaceChildren(...SKIN_PARTS.map((part) => partRow(part, skin, stats, pick)))
  render()

  return {
    skin,
    open() {
      render() // stats may have grown since last time
      hint.textContent = ''
      dialog.showModal()
      animatePreview(dialog, canvas, skin, trails)
    },
  }
}

// Runs while the dialog is open (Done or Esc closes it).
function animatePreview(dialog: HTMLDialogElement, canvas: HTMLCanvasElement, skin: Skin, trails: Trails) {
  let clock = 0
  let last = performance.now()
  requestAnimationFrame(function frame(now) {
    if (!dialog.open) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    clock += dt
    drawPreview(canvas, skin, trails, { clock, dt })
    requestAnimationFrame(frame)
  })
}

function partRow(part: SkinPart, skin: Skin, stats: Stats, pick: (part: SkinPart, id: string) => void) {
  const row = document.createElement('div')
  row.className = 'skin-row'
  const label = row.appendChild(document.createElement('span'))
  label.textContent = part
  for (const [id, option] of Object.entries<{ label: string; unlock: GoalId | null }>(SKINS[part])) {
    const locked = option.unlock !== null && !reached(option.unlock, stats)
    const button = row.appendChild(document.createElement('button'))
    button.type = 'button'
    button.textContent = locked ? `🔒 ${option.label}` : option.label
    button.classList.toggle('on', skin[part] === id)
    button.classList.toggle('locked', locked)
    button.setAttribute('aria-pressed', String(skin[part] === id))
    button.onclick = () => pick(part, id)
  }
  return row
}

// The rocket hovering with both engines on, over the dusk sky.
type Trails = ReturnType<typeof createTrails>

type Tick = { clock: number; dt: number }

function drawPreview(canvas: HTMLCanvasElement, skin: Skin, trails: Trails, { clock, dt }: Tick) {
  const ctx = context2d(canvas)
  const { w, h } = fitCanvas(canvas)
  const scale = Math.min(w / PREVIEW.w, h / PREVIEW.h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  for (const [at, color] of SKIES.dusk.sky) sky.addColorStop(at, color)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(scale, 0, 0, scale, (w - PREVIEW.w * scale) / 2, (h - PREVIEW.h * scale) / 2)
  const rocket = {
    x: PREVIEW.w / 2 + Math.sin(clock * 0.7) * 6,
    y: ROCKET_Y + Math.sin(clock * 1.3) * 3,
    angle: Math.sin(clock * 0.7) * 0.15,
    team: 'blue' as const,
    input: { left: true, right: true },
    skin,
  }
  trails.shed(rocket, config.rocket.engineOffset, dt)
  trails.draw(ctx, dt)
  drawRocket(ctx, rocket, config.rocket.engineOffset)
}
