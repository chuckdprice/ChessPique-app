/** Persisted user settings: appearance (theme, board, pieces) and engine options. */

import { BOARDS, PIECE_SETS, THEMES, boardById, themeById } from './appearance'
import { nearestRating } from './maia/model'

export interface AppearanceSettings {
  /** Theme id from THEMES — a whole palette, not just an accent. */
  theme: string
  /** Board colour id from BOARDS. */
  board: string
  /** Piece set id from PIECE_SETS. */
  pieces: string
}

export interface EngineSettings {
  /** Live-analysis budget per position, in seconds. */
  searchTimeSec: number
  /** MultiPV — number of engine lines shown. */
  multiPv: number
  /** Hash table size in MB. */
  hashMb: number
  /** Print each candidate's score at the head of its arrow on the board. */
  arrowEvals: boolean
  /**
   * Show Maia-3's human-move predictions beside the engine's. Off by default:
   * turning it on is what fetches the 43 MB model.
   */
  maia: boolean
  /**
   * The rating Maia conditions on, or null to follow the review's "played like"
   * estimate for whoever is on move.
   *
   * Null is the default rather than a number because the estimate is the more
   * useful starting point and it changes as you step through the game — but the
   * moment the reader picks a rating themselves, that is the question they are
   * asking and it stops moving under them.
   */
  maiaRating: number | null
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'tournament',
  board: 'tournament',
  pieces: 'classic',
}
export const DEFAULT_ENGINE: EngineSettings = {
  searchTimeSec: 8,
  multiPv: 3,
  hashMb: 128,
  arrowEvals: true,
  maia: false,
  maiaRating: null,
}

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
  // Settings saved before the themes existed hold 'light' | 'dark' | 'system'
  // here. Anything that is not a theme id resolves to the closest preset —
  // whether it came from that older shape or from a theme since renamed.
  if (!THEMES.some((t) => t.id === a.theme)) {
    const wantsDark = a.theme === 'dark' || (a.theme === 'system' && systemDark())
    a.theme = wantsDark ? 'midnight' : DEFAULT_APPEARANCE.theme
  }
  if (!BOARDS.some((b) => b.id === a.board)) a.board = DEFAULT_APPEARANCE.board
  if (!PIECE_SETS.some((p) => p.id === a.pieces)) a.pieces = DEFAULT_APPEARANCE.pieces
  // Only these three go back out, so a key from an older shape — `accent`,
  // say — is dropped on the next save rather than carried forever.
  return { theme: a.theme, board: a.board, pieces: a.pieces }
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
  // A setting saved before this one existed merges the default in as any other
  // missing key would, but a file hand-edited to a string would not.
  e.arrowEvals = e.arrowEvals !== false
  e.maia = e.maia === true
  e.maiaRating =
    typeof e.maiaRating === 'number' && Number.isFinite(e.maiaRating)
      ? nearestRating(e.maiaRating)
      : null
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

/**
 * Put the appearance on <html>: the theme's base picks the var block in
 * index.css, its own vars go on as inline properties, which beat any rule in
 * the stylesheet, and the board's two colours join them so the board and its
 * previews can read one source.
 */
export function applyAppearance(a: AppearanceSettings): void {
  const root = document.documentElement
  const theme = themeById(a.theme)
  root.dataset.theme = theme.base
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value)
  const board = boardById(a.board)
  root.style.setProperty('--board-light', board.light)
  root.style.setProperty('--board-dark', board.dark)
}
