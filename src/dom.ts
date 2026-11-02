// Lookups for elements the HTML is known to have. A missing one is a bug in the page, so it fails here, by name.
export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`No element #${id} in the page`)
  return element as T
}

export function find<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector)
  if (!element) throw new Error(`No element matches "${selector}"`)
  return element
}

// A 2d context; only null if the canvas already has another kind of context.
export function context2d(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings) {
  const ctx = canvas.getContext('2d', settings)
  if (!ctx) throw new Error('Canvas has no 2d context')
  return ctx
}
