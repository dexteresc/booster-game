import { SKIES } from './art/theme.js'
import { fitCanvas } from './art/brush.js'
import { drawFlag, drawPad } from './art/scenery.js'
import { drawRock } from './art/solids.js'
import { drawCannon } from './art/sprites.js'

// Start screen: pick a name, then PvE or PvP. Opened from an invite link it offers Join instead.
// Mode pictures are drawn live with the game's own art.

const NAME_KEY = 'booster-name'
const SKY = SKIES.dusk
const PICTURE = { w: 220, h: 96 } // world units shown in a mode card
const GROUND_Y = 76

// handlers: { onPick(mode, name), onJoin(name) }. joinCode set → only Join is offered.
export function showMenu(panel, { joinCode, rules, handlers }) {
  const nameInput = panel.querySelector('#player-name')
  nameInput.value = loadName()
  const name = () => {
    saveName(nameInput.value)
    return nameInput.value
  }
  panel.querySelector('.menu-modes').hidden = Boolean(joinCode)
  panel.querySelector('.menu-pve-rules').textContent =
    `Co-op vs the computer. Steal its flag ${rules.capturesToWin}× before its turrets shoot you down ${rules.cpuKillsToWin}×.`
  const joinButton = panel.querySelector('.menu-join')
  joinButton.hidden = !joinCode
  joinButton.textContent = `Join room ${joinCode}`
  joinButton.onclick = () => handlers.onJoin(name())
  for (const card of panel.querySelectorAll('[data-mode]')) card.onclick = () => handlers.onPick(card.dataset.mode, name())
  panel.hidden = false
  animatePictures(panel)
}

function animatePictures(panel) {
  const pictures = [...panel.querySelectorAll('[data-mode] canvas')]
  requestAnimationFrame(function frame(now) {
    if (panel.hidden) return
    for (const canvas of pictures) drawPicture(canvas, canvas.closest('[data-mode]').dataset.mode, now / 1000)
    requestAnimationFrame(frame)
  })
}

// PvE: the computer's flag and a turret. PvP: a flag on each side.
function drawPicture(canvas, mode, clock) {
  const ctx = canvas.getContext('2d')
  const { w, h } = fitCanvas(canvas)
  const scale = Math.min(w / PICTURE.w, h / PICTURE.h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  for (const [at, color] of SKY.sky) sky.addColorStop(at, color)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(scale, 0, 0, scale, (w - PICTURE.w * scale) / 2, (h - PICTURE.h * scale) / 2)
  drawRock(ctx, { x: -40, y: GROUND_Y, w: PICTURE.w + 80, h: 60 }, SKY, 'desert')
  if (mode === 'pvp') {
    drawBase(ctx, 10, 'blue', clock)
    drawBase(ctx, PICTURE.w - 100, 'red', clock)
    return
  }
  drawBase(ctx, 20, 'red', clock)
  const aim = -Math.PI / 2 - 0.5 + Math.sin(clock * 0.8) * 0.35
  drawCannon(ctx, { x: 165, y: GROUND_Y, team: 'red', aim }, clock % 1.6 < 0.08, clock)
}

function drawBase(ctx, x, team, clock) {
  const pad = { x, y: GROUND_Y - 14, w: 90, h: 14 }
  drawPad(ctx, pad, team, clock)
  drawFlag(ctx, { x: x + pad.w / 2, y: pad.y }, team, clock)
}

// Remembering the name is a convenience: storage can be blocked (private mode), the game works without it.
export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch (err) {
    console.warn('Could not read saved name', err)
    return ''
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch (err) {
    console.warn('Could not save name', err)
  }
}
