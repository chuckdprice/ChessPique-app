import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assignFolder,
  filterIsStale,
  matchesFilter,
  cleanFolderName,
  FOLDER_NAME_MAX,
  foldersOf,
  loadFolders,
  pruneFolders,
  removeFolder,
  renameFolder,
  saveFolders,
  studiesIn,
} from './folders'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  } as Storage
}

describe('cleanFolderName', () => {
  it('trims and collapses, so two spellings cannot look identical', () => {
    expect(cleanFolderName('  Openings ')).toBe('Openings')
    expect(cleanFolderName('Black  vs   1.e4')).toBe('Black vs 1.e4')
  })

  it('rejects an empty name and one too long to be a chip', () => {
    expect(cleanFolderName('')).toBeNull()
    expect(cleanFolderName('   ')).toBeNull()
    expect(cleanFolderName('x'.repeat(FOLDER_NAME_MAX + 1))).toBeNull()
    expect(cleanFolderName('x'.repeat(FOLDER_NAME_MAX))).toHaveLength(FOLDER_NAME_MAX)
  })
})

describe('assignFolder', () => {
  it('files a study', () => {
    expect(assignFolder({}, 'a', 'Openings')).toEqual({ a: 'Openings' })
  })

  it('unfiles one', () => {
    expect(assignFolder({ a: 'Openings' }, 'a', null)).toEqual({})
  })

  it('keeps an existing folder\'s own spelling', () => {
    // Otherwise "openings" and "Openings" become two folders that read the same.
    const map = assignFolder({ a: 'Openings' }, 'b', 'openings')
    expect(map).toEqual({ a: 'Openings', b: 'Openings' })
    expect(foldersOf(map)).toEqual(['Openings'])
  })

  it('does not mutate the map it was given', () => {
    const map = { a: 'Openings' }
    assignFolder(map, 'b', 'Endgames')
    expect(map).toEqual({ a: 'Openings' })
  })

  it('ignores a name that is not one', () => {
    expect(assignFolder({ a: 'Openings' }, 'b', '   ')).toEqual({ a: 'Openings' })
  })
})

describe('foldersOf', () => {
  it('lists each folder once, in reading order', () => {
    expect(foldersOf({ a: 'Endgames', b: 'openings', c: 'Endgames' })).toEqual([
      'Endgames',
      'openings',
    ])
  })

  it('is empty when nothing is filed', () => {
    expect(foldersOf({})).toEqual([])
  })
})

describe('renameFolder', () => {
  it('takes every study in it along', () => {
    expect(renameFolder({ a: 'Old', b: 'Other', c: 'Old' }, 'Old', 'New')).toEqual({
      a: 'New',
      b: 'Other',
      c: 'New',
    })
  })

  it('refuses a name that is not one', () => {
    const map = { a: 'Old' }
    expect(renameFolder(map, 'Old', '  ')).toBe(map)
  })
})

describe('removeFolder', () => {
  it('unfiles its studies rather than deleting them', () => {
    // A folder is exactly the set of studies naming it, so emptying it is the
    // only way one goes away — and the studies themselves are untouched.
    expect(removeFolder({ a: 'Gone', b: 'Kept' }, 'Gone')).toEqual({ b: 'Kept' })
  })
})

describe('pruneFolders', () => {
  it('drops a study the listing no longer has', () => {
    expect(pruneFolders({ a: 'Openings', gone: 'Openings' }, ['a', 'b'])).toEqual({ a: 'Openings' })
  })

  it('leaves a fully live map alone', () => {
    expect(pruneFolders({ a: 'Openings' }, ['a'])).toEqual({ a: 'Openings' })
  })
})

describe('studiesIn', () => {
  const map = { a: 'Openings', b: 'Endgames' }

  it('finds the studies in one folder', () => {
    expect(studiesIn(map, 'Openings', ['a', 'b', 'c'])).toEqual(['a'])
  })

  it('treats null as the unfiled ones', () => {
    expect(studiesIn(map, null, ['a', 'b', 'c'])).toEqual(['c'])
  })

  it('keeps the order it was given, which is the listing\'s', () => {
    expect(studiesIn({}, null, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })
})

describe('matchesFilter', () => {
  const map = { a: 'Openings', b: 'Endgames' }

  it('lets everything through for "all"', () => {
    expect(matchesFilter(map, 'a', { kind: 'all' })).toBe(true)
    expect(matchesFilter(map, 'c', { kind: 'all' })).toBe(true)
  })

  it('finds the unfiled ones', () => {
    expect(matchesFilter(map, 'c', { kind: 'unfiled' })).toBe(true)
    expect(matchesFilter(map, 'a', { kind: 'unfiled' })).toBe(false)
  })

  it('finds one folder', () => {
    expect(matchesFilter(map, 'a', { kind: 'named', name: 'Openings' })).toBe(true)
    expect(matchesFilter(map, 'b', { kind: 'named', name: 'Openings' })).toBe(false)
  })
})

describe('filterIsStale', () => {
  it('notices a folder that has been emptied out of existence', () => {
    // Unfiling the last study in a folder deletes the folder, and the bar
    // would otherwise sit on a name nothing matches, showing an empty list.
    const map = removeFolder({ a: 'Gone' }, 'Gone')
    expect(filterIsStale(map, { kind: 'named', name: 'Gone' })).toBe(true)
  })

  it('is never stale for all or unfiled, which always exist', () => {
    expect(filterIsStale({}, { kind: 'all' })).toBe(false)
    expect(filterIsStale({}, { kind: 'unfiled' })).toBe(false)
  })
})

describe('storage', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('round-trips', () => {
    saveFolders({ a: 'Openings' })
    expect(loadFolders()).toEqual({ a: 'Openings' })
  })

  it('is empty when nothing has been stored', () => {
    expect(loadFolders()).toEqual({})
  })

  it('survives a corrupted value', () => {
    localStorage.setItem('chesspique.folders', '{not json')
    expect(loadFolders()).toEqual({})
  })

  it('survives a value of the wrong shape', () => {
    localStorage.setItem('chesspique.folders', JSON.stringify(['Openings']))
    expect(loadFolders()).toEqual({})
  })

  it('drops entries that are not names rather than the whole map', () => {
    localStorage.setItem(
      'chesspique.folders',
      JSON.stringify({ a: 'Openings', b: 42, c: '   ', d: null }),
    )
    expect(loadFolders()).toEqual({ a: 'Openings' })
  })

  it('carries the value across from the old key name', () => {
    localStorage.setItem('chessnoter.folders', JSON.stringify({ a: 'Openings' }))
    expect(loadFolders()).toEqual({ a: 'Openings' })
    expect(localStorage.getItem('chessnoter.folders')).toBeNull()
  })
})
