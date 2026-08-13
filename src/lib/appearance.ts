/**
 * The three things the appearance dialog picks: a colour theme, a board, and
 * a piece set.
 *
 * A theme is a whole palette rather than an accent. Each one names a base —
 * the light or dark var block in index.css, which carries the chart, status
 * and classification colours — and then overrides the eleven variables that
 * give the app its character. Every theme sets all eleven, so switching between
 * them never leaves a stale value behind.
 */

export type ThemeVar =
  | '--page'
  | '--card'
  | '--ink'
  | '--ink-mute'
  | '--rule'
  | '--field'
  | '--on-accent'
  | '--accent'
  | '--accent-hover'
  | '--accent-bright'
  /**
   * Maia's colour, on its arrow and in its column heading.
   *
   * It has to read as neither engine nor game: the engine's candidates are
   * blue, the move actually played next is orange, and the classification
   * scale runs green to red. That leaves violet, which every theme uses except
   * Neon — whose own accent is violet, so there it steps sideways to magenta.
   */
  | '--maia'

export interface Theme {
  id: string
  name: string
  /** Which var block in index.css supplies everything not listed below. */
  base: 'light' | 'dark'
  vars: Record<ThemeVar, string>
}

export const THEMES: Theme[] = [
  {
    id: 'tournament',
    name: 'Tournament Green',
    base: 'light',
    vars: {
      '--page': '#f7f6f1',
      '--card': '#fffefb',
      '--ink': '#23221e',
      '--ink-mute': '#6d675c',
      '--rule': '#e3ded2',
      '--field': '#f6f1e4',
      '--on-accent': '#f5f0e2',
      '--accent': '#1e5943',
      '--accent-hover': '#153f30',
      '--accent-bright': '#2c7a5c',
      '--maia': '#7c3aed',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Blitz',
    base: 'dark',
    vars: {
      '--page': '#0d0d0d',
      '--card': '#1a1a19',
      '--ink': '#f2f1ec',
      '--ink-mute': '#a29c8e',
      '--rule': '#2e2e2b',
      '--field': '#232321',
      '--on-accent': '#f5f0e2',
      '--accent': '#2563c4',
      '--accent-hover': '#2f74e0',
      '--accent-bright': '#5a94e8',
      '--maia': '#b48cff',
    },
  },
  {
    id: 'cafe',
    name: 'Café Classic',
    base: 'light',
    vars: {
      '--page': '#f4ecdd',
      '--card': '#fdf8ec',
      '--ink': '#3b2f22',
      '--ink-mute': '#7b6a52',
      '--rule': '#e2d5bd',
      '--field': '#f1e6d1',
      '--on-accent': '#fdf6e7',
      '--accent': '#7d5327',
      '--accent-hover': '#603d18',
      '--accent-bright': '#a5713a',
      '--maia': '#7b3fbf',
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    base: 'dark',
    vars: {
      '--page': '#0f172a',
      '--card': '#182034',
      '--ink': '#e6edf7',
      '--ink-mute': '#93a4bd',
      '--rule': '#25334d',
      '--field': '#1e293f',
      '--on-accent': '#eaf2ff',
      '--accent': '#2f6fd0',
      '--accent-hover': '#3b81e8',
      '--accent-bright': '#65a3f0',
      '--maia': '#b98cf5',
    },
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    base: 'light',
    vars: {
      '--page': '#f8f1ee',
      '--card': '#fffaf8',
      '--ink': '#2c1f1d',
      '--ink-mute': '#7a5f5a',
      '--rule': '#ecd8d2',
      '--field': '#f7e9e4',
      '--on-accent': '#fdf1ee',
      '--accent': '#963232',
      '--accent-hover': '#7a2525',
      '--accent-bright': '#bf5050',
      '--maia': '#6d3fc4',
    },
  },
  {
    id: 'forest',
    name: 'Forest Floor',
    base: 'dark',
    vars: {
      '--page': '#101510',
      '--card': '#1a211a',
      '--ink': '#e9ece3',
      '--ink-mute': '#9aa791',
      '--rule': '#2b332a',
      '--field': '#222a21',
      '--on-accent': '#eef4e9',
      '--accent': '#35704d',
      '--accent-hover': '#40875d',
      '--accent-bright': '#5aa877',
      '--maia': '#b28cf0',
    },
  },
  {
    id: 'ivory',
    name: 'Ivory & Ink',
    base: 'light',
    vars: {
      '--page': '#f4f4f2',
      '--card': '#ffffff',
      '--ink': '#1b1b1a',
      '--ink-mute': '#6b6b67',
      '--rule': '#dededc',
      '--field': '#eeeeec',
      '--on-accent': '#f7f7f5',
      '--accent': '#33332f',
      '--accent-hover': '#1f1f1c',
      '--accent-bright': '#5c5c56',
      '--maia': '#6d3fc4',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Rapid',
    base: 'light',
    vars: {
      '--page': '#fdf3ea',
      '--card': '#fffaf4',
      '--ink': '#31241a',
      '--ink-mute': '#8a6b52',
      '--rule': '#f2dcc4',
      '--field': '#fbead8',
      '--on-accent': '#fff5eb',
      '--accent': '#b8480f',
      '--accent-hover': '#93370a',
      '--accent-bright': '#dd6a24',
      '--maia': '#7a3fd0',
    },
  },
  {
    id: 'neon',
    name: 'Neon Endgame',
    base: 'dark',
    vars: {
      '--page': '#0b0b12',
      '--card': '#15151f',
      '--ink': '#eceaff',
      '--ink-mute': '#9b98c0',
      '--rule': '#272738',
      '--field': '#1d1d2b',
      '--on-accent': '#f4f1ff',
      '--accent': '#6d3ac8',
      '--accent-hover': '#7f4ade',
      '--accent-bright': '#a684f2',
      // Violet is this theme's own accent, so Maia steps sideways to magenta.
      '--maia': '#f472b6',
    },
  },
  {
    id: 'arctic',
    name: 'Arctic Opening',
    base: 'light',
    vars: {
      '--page': '#f1f6f9',
      '--card': '#fbfdff',
      '--ink': '#16232b',
      '--ink-mute': '#5c7180',
      '--rule': '#d6e3ec',
      '--field': '#e8f1f7',
      '--on-accent': '#eef8fc',
      '--accent': '#0f6a88',
      '--accent-hover': '#0a5169',
      '--accent-bright': '#1f8fb3',
      '--maia': '#7c3aed',
    },
  },
]

export interface BoardColors {
  id: string
  name: string
  light: string
  dark: string
}

export const BOARDS: BoardColors[] = [
  { id: 'tournament', name: 'Tournament', light: '#efe8d6', dark: '#4e7d63' },
  { id: 'club', name: 'Club Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'walnut', name: 'Walnut', light: '#e8cfa5', dark: '#8b5a2b' },
  { id: 'newsprint', name: 'Newsprint', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'slate', name: 'Slate', light: '#e2e8ed', dark: '#647587' },
  { id: 'ice', name: 'Ice', light: '#dbe9f4', dark: '#7ba7c9' },
  { id: 'ocean', name: 'Ocean', light: '#d7e7ee', dark: '#3f7d8c' },
  { id: 'cobalt', name: 'Cobalt', light: '#dce6f5', dark: '#4a6fa8' },
  { id: 'marble', name: 'Marble', light: '#e9e6e0', dark: '#a9a49b' },
  { id: 'graphite', name: 'Graphite', light: '#d8d8d6', dark: '#5c5c5a' },
  { id: 'charcoal', name: 'Charcoal', light: '#c9c9c4', dark: '#45454a' },
  { id: 'midnight', name: 'Midnight', light: '#8e99a6', dark: '#2b3440' },
  { id: 'emerald', name: 'Emerald', light: '#e4ecdf', dark: '#2f7d5b' },
  { id: 'moss', name: 'Moss', light: '#e6ead6', dark: '#7d8f5a' },
  { id: 'mint', name: 'Mint', light: '#e3f0e8', dark: '#6fae8f' },
  { id: 'sand', name: 'Sand', light: '#f2e6cf', dark: '#c3a678' },
  { id: 'sepia', name: 'Sepia', light: '#f0e4d0', dark: '#a98763' },
  { id: 'amber', name: 'Amber', light: '#f7e5bd', dark: '#c08a22' },
  { id: 'coral', name: 'Coral', light: '#f5ded9', dark: '#c76d5f' },
  { id: 'wine', name: 'Wine', light: '#ecdcdc', dark: '#7d3a45' },
  { id: 'rose', name: 'Rose', light: '#f7e2e9', dark: '#c98a9e' },
  { id: 'lilac', name: 'Lilac', light: '#e9e2f5', dark: '#8a72c0' },
  { id: 'plum', name: 'Plum', light: '#e4dced', dark: '#5f4b7d' },
]

export interface PieceSet {
  id: string
  name: string
  /** Author and licence, for the credit line under the picker. */
  credit: string
}

/**
 * `classic` is react-chessboard's own drawing; the rest are files under
 * public/piece, taken from lichess. Only sets under a permissive or
 * attribution licence are here — the credits are shown in the picker and
 * listed in the README.
 */
export const PIECE_SETS: PieceSet[] = [
  { id: 'classic', name: 'Classic', credit: 'Colin M.L. Burnett — GPLv2+' },
  { id: 'merida', name: 'Merida', credit: 'Armando Hernandez Marroquin — GPLv2+' },
  { id: 'chessnut', name: 'Chessnut', credit: 'Alexis Luengas — Apache 2.0' },
  { id: 'fantasy', name: 'Fantasy', credit: 'Maurizio Monge — MIT' },
  { id: 'spatial', name: 'Spatial', credit: 'Maurizio Monge — MIT' },
  { id: 'celtic', name: 'Celtic', credit: 'Maurizio Monge — MIT' },
  { id: 'rhosgfx', name: 'Rhos', credit: 'RhosGFX — CC0 1.0' },
  { id: 'kiwen-suwi', name: 'Kiwen Suwi', credit: 'neverRare — CC BY 4.0' },
  { id: 'firi', name: 'Firi', credit: 'James Faure — CC BY 4.0' },
  { id: 'totoy', name: 'Totoy', credit: 'Kosal Sen — CC BY 4.0' },
  { id: 'papercut', name: 'Papercut', credit: 'Nikolay Anzarov — CC BY 4.0' },
]

/** wP … bK, the codes both react-chessboard and the lichess files use. */
export const PIECE_CODES = [
  'wP', 'wN', 'wB', 'wR', 'wQ', 'wK',
  'bP', 'bN', 'bB', 'bR', 'bQ', 'bK',
] as const

export type PieceCode = (typeof PIECE_CODES)[number]

/** Path to one piece's file; `classic` has none — the library draws it. */
export function pieceSrc(setId: string, code: PieceCode): string {
  return `${import.meta.env.BASE_URL}piece/${setId}/${code}.svg`
}

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]
export const boardById = (id: string): BoardColors => BOARDS.find((b) => b.id === id) ?? BOARDS[0]
export const pieceSetById = (id: string): PieceSet =>
  PIECE_SETS.find((p) => p.id === id) ?? PIECE_SETS[0]
