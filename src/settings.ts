import type { Config } from './config.ts'
import type { Settings } from './render.ts'
import { byId, find } from './dom.ts'
import { readStoredJson, writeStored } from './storage.ts'

// Settings dialog: ⚙ or `. Gameplay: config tunables, edited in place (the sim reads config every tick;
// "Copy" gives JSON to paste back into config.ts). Graphics: render settings, saved in this browser.

const SETTINGS_KEY = 'booster-settings'
const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ bloom: false, vignette: false, fps: false })

export function loadSettings(): Settings {
  const raw = readStoredJson(SETTINGS_KEY)
  const settings = { ...DEFAULT_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return settings
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'boolean') settings[key] = value
  }
  return settings
}

export function createSettingsDialog(config: Config, settings: Settings): void {
  const dialog = byId<HTMLDialogElement>('settings')
  const gameplay = find<HTMLElement>(dialog, '[data-tab="gameplay"].settings-page')
  for (const [section, values] of Object.entries(config)) {
    if (typeof values === 'object') addSection(gameplay, section, values)
  }
  addCopyButton(gameplay, config)
  bindGraphics(dialog, settings)
  bindTabs(dialog)

  const open = () => (dialog.open ? dialog.close() : dialog.showModal())
  byId('settings-toggle').onclick = open
  addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') open()
  })
}

function bindGraphics(dialog: HTMLDialogElement, settings: Settings) {
  for (const input of dialog.querySelectorAll<HTMLInputElement>('input[data-setting]')) {
    const key = input.dataset.setting as keyof Settings
    if (!(key in settings)) throw new Error(`Settings dialog has an input for unknown setting "${key}"`)
    input.checked = settings[key]
    input.onchange = () => {
      settings[key] = input.checked
      writeStored(SETTINGS_KEY, JSON.stringify(settings))
    }
  }
}

function bindTabs(dialog: HTMLDialogElement) {
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const pages = [...dialog.querySelectorAll<HTMLElement>('.settings-page')]
  const show = (name: string | undefined) => {
    for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name))
    for (const page of pages) page.hidden = page.dataset.tab !== name
  }
  for (const tab of tabs) tab.onclick = () => show(tab.dataset.tab)
  show(tabs[0]?.dataset.tab)
}

function addSection(panel: HTMLElement, section: string, values: Record<string, unknown>) {
  const keys = Object.keys(values).filter((k) => typeof values[k] === 'number' || typeof values[k] === 'boolean')
  if (!keys.length) return
  const fieldset = panel.appendChild(document.createElement('fieldset'))
  fieldset.appendChild(document.createElement('legend')).textContent = section
  for (const key of keys) addField(fieldset, values, key)
}

// Edits values[key] in place.
function addField(fieldset: HTMLFieldSetElement, values: Record<string, unknown>, key: string) {
  const value = values[key]
  const label = fieldset.appendChild(document.createElement('label'))
  label.append(key)
  const input = label.appendChild(document.createElement('input'))
  if (typeof value === 'boolean') {
    input.type = 'checkbox'
    input.checked = value
    input.onchange = () => {
      values[key] = input.checked
    }
    return
  }
  if (typeof value !== 'number') return
  input.type = 'number'
  input.step = String(10 ** (Math.floor(Math.log10(Math.abs(value) || 1)) - 1))
  input.value = String(value)
  input.oninput = () => {
    if (Number.isFinite(input.valueAsNumber)) values[key] = input.valueAsNumber
  }
}

function addCopyButton(panel: HTMLElement, config: Config) {
  const copy = panel.appendChild(document.createElement('button'))
  copy.textContent = 'Copy config JSON'
  copy.onclick = () =>
    navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(
      () => {
        copy.textContent = 'Copied'
      },
      (err) => {
        copy.textContent = 'Copy failed (see console)'
        console.error('Clipboard write failed', err)
      },
    )
}
