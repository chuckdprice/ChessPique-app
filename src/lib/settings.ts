/** Persisted user settings: appearance (theme, board, pieces) and engine options. */

import { BOARDS, PIECE_SETS, THEMES, boardById, themeById } from './appearance'
import { readStored } from './storage'
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
   * Show Maia-3's human-move predictions beside the engine's. On by default,
   * which means the 46 MB model is fetched the first time the Move Evals pane
   * is opened — nothing downloads while the pane is shut, and every failure
   * path still falls back to Stockfish alone.
   */
  maia: boolean
  /**
   * Print Maia's probability at the head of its arrow. Separate from
   * `arrowEvals` because it answers a different question — how likely, not how
   * good — and a board carrying both numbers on every square is a board some
   * readers want back.
   */
  maiaArrowEvals: boolean
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

/** Rating bands the opening explorer offers, as the API's enum names them. */
export const EXPLORER_RATINGS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const

/** Game speeds, in the order Lichess lists them. */
export const EXPLORER_SPEEDS = [
  'ultraBullet',
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
] as const

export type ExplorerSpeed = (typeof EXPLORER_SPEEDS)[number]

/** Rated or casual, which only the player database can filter on. */
export const EXPLORER_MODES = ['casual', 'rated'] as const
export type ExplorerMode = (typeof EXPLORER_MODES)[number]

/** How many past opponents the player dialog offers as one-click buttons. */
export const RECENT_PLAYERS_KEPT = 8

/**
 * The opening explorer's filters.
 *
 * The two databases filter on different things and at different granularities
 * — Lichess games by speed, rating band and *month*, master games by *year*
 * alone — so the date range is two pairs rather than one. Lichess's own panel
 * does the same, and a year typed into a month field is the sort of thing that
 * silently returns nothing.
 */
export interface ExplorerSettings {
  db: 'masters' | 'lichess' | 'player'
  /**
   * Shared by the Lichess and player databases, which both filter on speed and
   * both take a month. Masters has neither, and its own year pair below. One
   * preference rather than two: "I care about rapid and classical" is a fact
   * about the reader, not about which database they are looking at.
   */
  speeds: ExplorerSpeed[]
  /** `YYYY-MM`, or empty for no bound. */
  since: string
  until: string
  /** Lichess database only. Empty means every band. */
  ratings: number[]
  /** `YYYY`, or empty for no bound. Masters database. */
  mastersSince: string
  mastersUntil: string
  /** Player database. The Lichess username whose games are being read. */
  player: string
  /** Which side to look for them on — the endpoint requires one. */
  playerColor: 'white' | 'black'
  /** Player database only; masters and Lichess games are all rated. */
  modes: ExplorerMode[]
  /** Usernames looked up before, newest first, for the player dialog. */
  recentPlayers: string[]
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
  maia: true,
  maiaArrowEvals: true,
  maiaRating: null,
}

/**
 * Everything on, and no date bounds: the API's own default is every speed and
 * every band, and a filter nobody asked for is a filter that quietly hides
 * games. Narrowing is what the gear is for.
 */
export const DEFAULT_EXPLORER: ExplorerSettings = {
  db: 'lichess',
  speeds: [...EXPLORER_SPEEDS],
  since: '',
  until: '',
  ratings: [...EXPLORER_RATINGS],
  mastersSince: '',
  mastersUntil: '',
  player: '',
  playerColor: 'white',
  modes: [...EXPLORER_MODES],
  recentPlayers: [],
}

const APPEARANCE_KEY = 'chesspique.appearance'
const EXPLORER_KEY = 'chesspique.explorer'
const ENGINE_KEY = 'chesspique.engine'

function load<T>(key: string, fallback: T): T {
  try {
    // readStored, not getItem: these keys were `chessnoter.*` before the app
    // was renamed, and a reader's saved settings move across on first read.
    const raw = readStored(key)
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
  e.maia = e.maia !== false
  e.maiaArrowEvals = e.maiaArrowEvals !== false
  e.maiaRating =
    typeof e.maiaRating === 'number' && Number.isFinite(e.maiaRating)
      ? nearestRating(e.maiaRating)
      : null
  return e
}

/** `YYYY-MM` for the Lichess database, `YYYY` for masters; '' for no bound. */
function cleanMonth(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : ''
}
function cleanYear(value: unknown): string {
  return typeof value === 'string' && /^\d{4}$/.test(value) ? value : ''
}

export function loadExplorerSettings(): ExplorerSettings {
  const e = load(EXPLORER_KEY, DEFAULT_EXPLORER)
  // Every field is re-derived from the allowed values rather than trusted: a
  // speed or band this build no longer knows would go straight into a query
  // string, and the endpoint answers a bad filter with a 400.
  const speeds = Array.isArray(e.speeds)
    ? EXPLORER_SPEEDS.filter((s) => (e.speeds as unknown[]).includes(s))
    : DEFAULT_EXPLORER.speeds
  const ratings = Array.isArray(e.ratings)
    ? EXPLORER_RATINGS.filter((r) => (e.ratings as unknown[]).includes(r))
    : DEFAULT_EXPLORER.ratings
  const modes = Array.isArray(e.modes)
    ? EXPLORER_MODES.filter((m) => (e.modes as unknown[]).includes(m))
    : DEFAULT_EXPLORER.modes
  return {
    db: e.db === 'masters' || e.db === 'player' ? e.db : 'lichess',
    // An empty list would ask for nothing at all rather than for everything,
    // and no click in the panel can produce one — but a hand-edited entry can.
    speeds: speeds.length > 0 ? [...speeds] : [...DEFAULT_EXPLORER.speeds],
    ratings: ratings.length > 0 ? [...ratings] : [...DEFAULT_EXPLORER.ratings],
    since: cleanMonth(e.since),
    until: cleanMonth(e.until),
    mastersSince: cleanYear(e.mastersSince),
    mastersUntil: cleanYear(e.mastersUntil),
    // Lichess usernames are 2-30 of these; anything else was never a username
    // and would come back as a 404 dressed up as an empty explorer.
    player: typeof e.player === 'string' && isUsername(e.player) ? e.player : '',
    playerColor: e.playerColor === 'black' ? 'black' : 'white',
    modes: modes.length > 0 ? [...modes] : [...DEFAULT_EXPLORER.modes],
    recentPlayers: Array.isArray(e.recentPlayers)
      ? (e.recentPlayers as unknown[])
          .filter((n): n is string => typeof n === 'string' && isUsername(n))
          .slice(0, RECENT_PLAYERS_KEPT)
      : [],
  }
}

/** Lichess's own rule for a username, so a typo never reaches the API. */
export function isUsername(value: string): boolean {
  return /^[a-zA-Z0-9][\w-]{1,29}$/.test(value)
}

/**
 * The name moved to the front, without duplicates.
 *
 * Case is kept as typed — Lichess displays what you signed up with — but the
 * comparison ignores it, because looking up the same player twice with a
 * different capitalisation should not fill the dialog with the same person.
 */
export function withRecentPlayer(recent: string[], name: string): string[] {
  const lower = name.toLowerCase()
  return [name, ...recent.filter((n) => n.toLowerCase() !== lower)].slice(0, RECENT_PLAYERS_KEPT)
}

export function saveExplorerSettings(e: ExplorerSettings): void {
  try {
    localStorage.setItem(EXPLORER_KEY, JSON.stringify(e))
  } catch {
    /* ignore */
  }
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
