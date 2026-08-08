import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BOARDS, PIECE_SETS, THEMES, boardById, pieceSetById, themeById } from './appearance'
import type { ThemeVar } from './appearance'
import {
  DEFAULT_APPEARANCE,
  MIN_PANE_PX,
  loadAppearance,
  loadPaneHeights,
  savePaneHeights,
  saveAppearance,
} from './settings'

/** Enough of the Storage API for the settings module; tests run in node. */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('appearance presets', () => {
  const VARS: ThemeVar[] = [
    '--page',
    '--card',
    '--ink',
    '--ink-mute',
    '--rule',
    '--field',
    '--on-accent',
    '--accent',
    '--accent-hover',
    '--accent-bright',
  ]

  // Every theme has to set every variable: they go on as inline properties and
  // are never cleared, so one a theme forgot would be inherited from whichever
  // theme was showing before it.
  it.each(THEMES)('$name sets all ten variables to colours', (theme) => {
    for (const name of VARS) {
      expect(theme.vars[name], `${theme.id} ${name}`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('gives every theme, board and set a unique id', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length)
    expect(new Set(PIECE_SETS.map((p) => p.id)).size).toBe(PIECE_SETS.length)
  })

  it('falls back to the first entry for an unknown id', () => {
    expect(themeById('nope')).toBe(THEMES[0])
    expect(boardById('nope')).toBe(BOARDS[0])
    expect(pieceSetById('nope')).toBe(PIECE_SETS[0])
  })
})

describe('loadAppearance', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('reads back what was saved', () => {
    saveAppearance({ theme: 'neon', board: 'walnut', pieces: 'fantasy' })
    expect(loadAppearance()).toEqual({ theme: 'neon', board: 'walnut', pieces: 'fantasy' })
  })

  it('defaults when nothing is stored', () => {
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE)
  })

  // The shape before the themes existed: a light/dark/system preference and an
  // accent name. Both fields are gone; a stored one must not survive as a theme
  // id, and must not be written back out either.
  it('turns the old dark preference into a dark theme', () => {
    localStorage.setItem('chessnoter.appearance', JSON.stringify({ theme: 'dark', accent: 'blue' }))
    const loaded = loadAppearance()
    expect(themeById(loaded.theme).base).toBe('dark')
    expect(loaded).not.toHaveProperty('accent')
  })

  it('turns the old light preference into a light theme', () => {
    localStorage.setItem('chessnoter.appearance', JSON.stringify({ theme: 'light', accent: 'red' }))
    expect(loadAppearance().theme).toBe(DEFAULT_APPEARANCE.theme)
  })

  it('replaces a board or piece set that no longer exists', () => {
    localStorage.setItem(
      'chessnoter.appearance',
      JSON.stringify({ theme: 'arctic', board: 'gone', pieces: 'gone' }),
    )
    expect(loadAppearance()).toEqual({
      theme: 'arctic',
      board: DEFAULT_APPEARANCE.board,
      pieces: DEFAULT_APPEARANCE.pieces,
    })
  })

  it('survives a corrupt entry', () => {
    localStorage.setItem('chessnoter.appearance', '{not json')
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE)
  })
})

describe('pane heights', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('reads back what was saved', () => {
    savePaneHeights({ source: 320, converted: 240 })
    expect(loadPaneHeights()).toEqual({ source: 320, converted: 240 })
  })

  // A pane with no entry has never been dragged, and must stay absent rather
  // than gain a number: the stylesheet's viewport-relative default is what
  // makes the box the right size on a phone and on a desktop both.
  it('leaves a pane that was never dragged out of the result', () => {
    savePaneHeights({ source: 320 })
    expect(loadPaneHeights()).toEqual({ source: 320 })
  })

  it('clamps a height from outside the draggable range', () => {
    savePaneHeights({ source: 1, converted: 99999 })
    const loaded = loadPaneHeights()
    expect(loaded.source).toBe(MIN_PANE_PX)
    expect(loaded.converted).toBe(2000)
  })

  it('ignores a value that is not a number', () => {
    localStorage.setItem('chessnoter.panes', JSON.stringify({ source: 'tall' }))
    expect(loadPaneHeights()).toEqual({})
  })

  it('survives a corrupt entry', () => {
    localStorage.setItem('chessnoter.panes', '{not json')
    expect(loadPaneHeights()).toEqual({})
  })
})
