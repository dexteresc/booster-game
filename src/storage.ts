// localStorage is a convenience: it can be blocked (private mode), and the game works without it.
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    console.warn(`Could not read saved ${key}`, err)
    return null
  }
}

// null when missing or unreadable: callers fall back to defaults.
export function readStoredJson(key: string): unknown {
  const text = readStored(key)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    console.warn(`Saved ${key} isn't JSON, starting over`, err)
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    console.warn(`Could not save ${key}`, err)
  }
}
