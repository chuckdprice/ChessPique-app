import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BOARDS, PIECE_SETS, THEMES, boardById, pieceSetById, themeById } from './appearance'
import type { ThemeVar } from './appearance'
import { legacyKey, readStored } from './storage'
import {
  DEFAULT_APPEARANCE,
  DEFAULT_EXPLORER,
  EXPLORER_RATINGS,
  EXPLORER_SPEEDS,
  loadAppearance,
  loadEngineSettings,
  loadExplorerSettings,
  maxThreads,
  saveAppearance,
  withRecentPlayer,
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
    '--maia',
  ]

  // Every theme has to set every variable: they go on as inline properties and
  // are never cleared, so one a theme forgot would be inherited from whichever
  // theme was showing before it.
  it.each(THEMES)('$name sets all eleven variables to colours', (theme) => {
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
    localStorage.setItem('chesspique.appearance', JSON.stringify({ theme: 'dark', accent: 'blue' }))
    const loaded = loadAppearance()
    expect(themeById(loaded.theme).base).toBe('dark')
    expect(loaded).not.toHaveProperty('accent')
  })

  it('turns the old light preference into a light theme', () => {
    localStorage.setItem('chesspique.appearance', JSON.stringify({ theme: 'light', accent: 'red' }))
    expect(loadAppearance().theme).toBe(DEFAULT_APPEARANCE.theme)
  })

  it('replaces a board or piece set that no longer exists', () => {
    localStorage.setItem(
      'chesspique.appearance',
      JSON.stringify({ theme: 'arctic', board: 'gone', pieces: 'gone' }),
    )
    expect(loadAppearance()).toEqual({
      theme: 'arctic',
      board: DEFAULT_APPEARANCE.board,
      pieces: DEFAULT_APPEARANCE.pieces,
    })
  })

  it('survives a corrupt entry', () => {
    localStorage.setItem('chesspique.appearance', '{not json')
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE)
  })
})


describe('engine settings', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('starts a first visit with Maia and both arrow numbers on', () => {
    const e = loadEngineSettings()
    expect(e.maia).toBe(true)
    expect(e.arrowEvals).toBe(true)
    expect(e.maiaArrowEvals).toBe(true)
  })

  it('keeps a switch the reader turned off', () => {
    localStorage.setItem(
      'chesspique.engine',
      JSON.stringify({ maia: false, maiaArrowEvals: false }),
    )
    const e = loadEngineSettings()
    expect(e.maia).toBe(false)
    expect(e.maiaArrowEvals).toBe(false)
  })

  it('gives settings saved before the arrow switch existed the default', () => {
    localStorage.setItem('chesspique.engine', JSON.stringify({ maia: true, multiPv: 4 }))
    const e = loadEngineSettings()
    expect(e.maiaArrowEvals).toBe(true)
    expect(e.multiPv).toBe(4)
  })

  it('starts single-threaded, rather than commandeering every core', () => {
    expect(loadEngineSettings().threads).toBe(1)
  })
})

/** `crossOriginIsolated` and `hardwareConcurrency` do not exist in node. */
function setEnvironment(isolated: boolean | undefined, cores: number | undefined) {
  const g = globalThis as Record<string, unknown>
  if (isolated === undefined) delete g.crossOriginIsolated
  else Object.defineProperty(g, 'crossOriginIsolated', { value: isolated, configurable: true })
  if (cores === undefined) delete g.navigator
  else Object.defineProperty(g, 'navigator', { value: { hardwareConcurrency: cores }, configurable: true })
}

describe('maxThreads', () => {
  afterEach(() => setEnvironment(undefined, undefined))

  it('is this machine\'s cores on an isolated page', () => {
    setEnvironment(true, 14)
    expect(maxThreads()).toBe(14)
  })

  it('is 1 without isolation, however many cores there are', () => {
    // No SharedArrayBuffer means no threads at all, so the core count is not
    // the number this page can use — offering it would be a slider that lies.
    setEnvironment(false, 14)
    expect(maxThreads()).toBe(1)
  })

  it('is 1 where the property does not exist, which includes node', () => {
    setEnvironment(undefined, 14)
    expect(maxThreads()).toBe(1)
  })

  it('reads a zero core count as one', () => {
    // A backgrounded browser pane reports 0, and so does an older browser with
    // no hardwareConcurrency. Neither means "no cores".
    setEnvironment(true, 0)
    expect(maxThreads()).toBe(1)
  })

  it('caps at 32, because the engine will not use more usefully', () => {
    setEnvironment(true, 256)
    expect(maxThreads()).toBe(32)
  })
})

describe('the stored thread count', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    localStorage.clear()
    setEnvironment(undefined, undefined)
  })

  it('is clamped to what this machine can actually run', () => {
    // Carried over from a bigger machine, or from a browser that could thread
    // when this one cannot. Corrected on read rather than sent to the engine.
    setEnvironment(true, 4)
    localStorage.setItem('chesspique.engine', JSON.stringify({ threads: 16 }))
    expect(loadEngineSettings().threads).toBe(4)
  })

  it('collapses to 1 on a page that is not isolated', () => {
    setEnvironment(false, 16)
    localStorage.setItem('chesspique.engine', JSON.stringify({ threads: 8 }))
    expect(loadEngineSettings().threads).toBe(1)
  })

  it('keeps a value the machine can honour', () => {
    setEnvironment(true, 14)
    localStorage.setItem('chesspique.engine', JSON.stringify({ threads: 10 }))
    expect(loadEngineSettings().threads).toBe(10)
  })

  it('refuses a nonsense value rather than passing it to the engine', () => {
    setEnvironment(true, 14)
    localStorage.setItem('chesspique.engine', JSON.stringify({ threads: -3 }))
    expect(loadEngineSettings().threads).toBe(1)
  })
})

describe('opening explorer settings', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('starts with every speed and band, and no date bounds', () => {
    expect(loadExplorerSettings()).toEqual(DEFAULT_EXPLORER)
    expect(DEFAULT_EXPLORER.speeds).toHaveLength(EXPLORER_SPEEDS.length)
    expect(DEFAULT_EXPLORER.ratings).toHaveLength(EXPLORER_RATINGS.length)
  })

  it('keeps a saved filter, in the canonical order', () => {
    localStorage.setItem(
      'chesspique.explorer',
      JSON.stringify({ db: 'masters', speeds: ['rapid', 'blitz'], ratings: [1800, 1400] }),
    )
    const e = loadExplorerSettings()
    expect(e.db).toBe('masters')
    // Written back in the order the panel lists them, not the order they were
    // clicked, so the query string is stable across sessions.
    expect(e.speeds).toEqual(['blitz', 'rapid'])
    expect(e.ratings).toEqual([1400, 1800])
  })

  it('drops a speed or band this build does not know', () => {
    localStorage.setItem(
      'chesspique.explorer',
      JSON.stringify({ speeds: ['blitz', 'hyperbullet'], ratings: [1600, 4000] }),
    )
    const e = loadExplorerSettings()
    expect(e.speeds).toEqual(['blitz'])
    expect(e.ratings).toEqual([1600])
  })

  it('refuses a filter that would ask for nothing at all', () => {
    localStorage.setItem('chesspique.explorer', JSON.stringify({ speeds: [], ratings: [] }))
    const e = loadExplorerSettings()
    expect(e.speeds).toEqual(DEFAULT_EXPLORER.speeds)
    expect(e.ratings).toEqual(DEFAULT_EXPLORER.ratings)
  })

  it('throws away a date that is not the shape its endpoint takes', () => {
    localStorage.setItem(
      'chesspique.explorer',
      JSON.stringify({
        since: '2024',
        until: '2024-13',
        mastersSince: '2024-06',
        mastersUntil: '1998',
      }),
    )
    const e = loadExplorerSettings()
    // A year in the month field and a month in the year field are exactly
    // what a hand-edited entry looks like, and both filter nothing silently.
    expect(e.since).toBe('')
    expect(e.until).toBe('')
    expect(e.mastersSince).toBe('')
    expect(e.mastersUntil).toBe('1998')
  })
})

describe('the player database\'s settings', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('throws away anything that is not a Lichess username', () => {
    localStorage.setItem(
      'chesspique.explorer',
      JSON.stringify({ player: 'not a username', recentPlayers: ['DragonBeard', 'x', 12] }),
    )
    const e = loadExplorerSettings()
    // A name Lichess would reject comes back as an empty explorer, which
    // reads as "this player never played this" rather than as a typo.
    expect(e.player).toBe('')
    expect(e.recentPlayers).toEqual(['DragonBeard'])
  })

  it('keeps a valid player, colour and mode', () => {
    localStorage.setItem(
      'chesspique.explorer',
      JSON.stringify({ player: 'DragonBeard', playerColor: 'black', modes: ['rated'] }),
    )
    const e = loadExplorerSettings()
    expect(e.player).toBe('DragonBeard')
    expect(e.playerColor).toBe('black')
    expect(e.modes).toEqual(['rated'])
  })

  it('falls back to white for a colour the endpoint would refuse', () => {
    localStorage.setItem('chesspique.explorer', JSON.stringify({ playerColor: 'either' }))
    expect(loadExplorerSettings().playerColor).toBe('white')
  })

  it('moves a repeat lookup to the front without duplicating it', () => {
    expect(withRecentPlayer(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    // Lichess shows the capitalisation you signed up with, but the same
    // player typed two ways is still one player.
    expect(withRecentPlayer(['DragonBeard'], 'dragonbeard')).toEqual(['dragonbeard'])
  })

  it('keeps only the handful the dialog can show', () => {
    let recent: string[] = []
    for (let i = 0; i < 20; i += 1) recent = withRecentPlayer(recent, `player${i}`)
    expect(recent).toHaveLength(8)
    expect(recent[0]).toBe('player19')
  })
})

describe('the keys the rename left behind', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('knows what each key used to be called', () => {
    expect(legacyKey('chesspique.engine')).toBe('chessnoter.engine')
    expect(legacyKey('chesspique.lichess')).toBe('chessnoter.lichess')
    // Not one of ours: nothing to migrate from.
    expect(legacyKey('someone.else')).toBeNull()
  })

  it('adopts what the old name held, and takes the old name away', () => {
    localStorage.setItem('chessnoter.engine', '{"multiPv":5}')
    expect(readStored('chesspique.engine')).toBe('{"multiPv":5}')
    // Moved, not copied: a stale value left behind could come back later and
    // read as settings rising from the dead.
    expect(localStorage.getItem('chesspique.engine')).toBe('{"multiPv":5}')
    expect(localStorage.getItem('chessnoter.engine')).toBeNull()
  })

  it('prefers the new name when both exist', () => {
    localStorage.setItem('chessnoter.engine', '{"multiPv":1}')
    localStorage.setItem('chesspique.engine', '{"multiPv":5}')
    expect(readStored('chesspique.engine')).toBe('{"multiPv":5}')
  })

  it('carries real settings across the rename', () => {
    // What a browser that last ran the app under its old name is holding.
    localStorage.setItem('chessnoter.appearance', JSON.stringify({ theme: 'arctic' }))
    localStorage.setItem('chessnoter.engine', JSON.stringify({ multiPv: 5, maia: false }))
    localStorage.setItem('chessnoter.explorer', JSON.stringify({ db: 'masters' }))

    expect(loadAppearance().theme).toBe('arctic')
    expect(loadEngineSettings().multiPv).toBe(5)
    expect(loadEngineSettings().maia).toBe(false)
    expect(loadExplorerSettings().db).toBe('masters')
  })

  it('is quiet when there is nothing under either name', () => {
    expect(readStored('chesspique.engine')).toBeNull()
    expect(loadEngineSettings().multiPv).toBe(3)
  })
})
