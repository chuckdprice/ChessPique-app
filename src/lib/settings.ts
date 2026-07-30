/** Persisted user settings: appearance (theme + accent) and engine options. */

export type ThemePreference = 'light' | 'dark' | 'system'
export type Accent = 'green' | 'blue' | 'purple' | 'orange' | 'red'

export interface AppearanceSettings {
  theme: ThemePreference
  accent: Accent
}

export interface EngineSettings {
  /** Live-analysis budget per position, in seconds. */
  searchTimeSec: number
  /** MultiPV — number of engine lines shown. */
  multiPv: number
  /** Hash table size in MB. */
  hashMb: number
}

export const ACCENTS: Accent[] = ['green', 'blue', 'purple', 'orange', 'red']

export const DEFAULT_APPEARANCE: AppearanceSettings = { theme: 'system', accent: 'green' }
export const DEFAULT_ENGINE: EngineSettings = { searchTimeSec: 8, multiPv: 3, hashMb: 128 }

const APPEARANCE_KEY = 'chessnoter.appearance'
const ENGINE_KEY = 'chessnoter.engine'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

export function loadAppearance(): AppearanceSettings {
  const a = load(APPEARANCE_KEY, DEFAULT_APPEARANCE)
  if (!['light', 'dark', 'system'].includes(a.theme)) a.theme = 'system'
  if (!ACCENTS.includes(a.accent)) a.accent = 'green'
  return a
}

export function saveAppearance(a: AppearanceSettings): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a))
  } catch {
    /* private mode etc. — settings just don't persist */
  }
}

export function loadEngineSettings(): EngineSettings {
  const e = load(ENGINE_KEY, DEFAULT_ENGINE)
  e.searchTimeSec = Math.min(30, Math.max(1, Math.round(e.searchTimeSec)))
  e.multiPv = Math.min(5, Math.max(1, Math.round(e.multiPv)))
  e.hashMb = Math.min(512, Math.max(16, Math.round(e.hashMb)))
  return e
}

export function saveEngineSettings(e: EngineSettings): void {
  try {
    localStorage.setItem(ENGINE_KEY, JSON.stringify(e))
  } catch {
    /* ignore */
  }
}

const systemDark = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches

/** Stamp data-theme / data-accent on <html> for the CSS variable scopes. */
export function applyAppearance(a: AppearanceSettings): void {
  const resolved = a.theme === 'system' ? (systemDark() ? 'dark' : 'light') : a.theme
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.accent = a.accent
}

/**
 * Apply stored appearance now and keep following the OS preference while the
 * user is in "system" mode. Returns an unsubscribe function.
 */
export function watchSystemTheme(getCurrent: () => AppearanceSettings): () => void {
  if (typeof matchMedia === 'undefined') return () => {}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    const current = getCurrent()
    if (current.theme === 'system') applyAppearance(current)
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
