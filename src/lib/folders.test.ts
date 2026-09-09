import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assignFolder,
  cleanFolderName,
  countIn,
  createFolder,
  EMPTY_FOLDERS,
  filterIsStale,
  FOLDER_NAME_MAX,
  foldersOf,
  loadFolders,
  matchesFilter,
  pruneFolders,
  removeFolder,
  renameFolder,
  saveFolders,
} from './folders'
import type { Folders } from './folders'

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

const folders = (names: string[], of: Record<string, string> = {}): Folders => ({ names, of })

describe('cleanFolderName', () => {
  it('trims and collapses, so two spellings cannot look identical', () => {
    expect(cleanFolderName('  Openings ')).toBe('Openings')
    expect(cleanFolderName('Black  vs   1.e4')).toBe('Black vs 1.e4')
  })

  it('rejects an empty name and one too long to be a chip', () => {
    expect(cleanFolderName('')).toBeNull()
    expect(cleanFolderName('   ')).toBeNull()
    expect(cleanFolderName('x'.repeat(FOLDER_NAME_MAX + 1))).toBeNull()
  })
})

describe('createFolder', () => {
  it('makes an empty folder, which is the whole point of the list', () => {
    // A folder used to be the set of studies naming it, so it could not exist
    // before it had a member and there was nothing to rename or delete.
    const made = createFolder(EMPTY_FOLDERS, 'Openings')
    expect(made.names).toEqual(['Openings'])
    expect(made.of).toEqual({})
  })

  it('does not make a second folder that reads the same', () => {
    expect(createFolder(folders(['Openings']), 'openings').names).toEqual(['Openings'])
  })

  it('ignores a name that is not one', () => {
    const before = folders(['Openings'])
    expect(createFolder(before, '   ')).toBe(before)
  })
})

describe('assignFolder', () => {
  it('files a study', () => {
    expect(assignFolder(folders(['Openings']), 'a', 'Openings').of).toEqual({ a: 'Openings' })
  })

  it('unfiles one, leaving the folder behind', () => {
    const after = assignFolder(folders(['Openings'], { a: 'Openings' }), 'a', null)
    expect(after.of).toEqual({})
    expect(after.names).toEqual(['Openings'])
  })

  it('makes the folder when filing into one that does not exist yet', () => {
    const after = assignFolder(EMPTY_FOLDERS, 'a', 'New')
    expect(after).toEqual({ names: ['New'], of: { a: 'New' } })
  })

  it("keeps an existing folder's own spelling", () => {
    const after = assignFolder(folders(['Openings'], { a: 'Openings' }), 'b', 'openings')
    expect(after.of).toEqual({ a: 'Openings', b: 'Openings' })
    expect(after.names).toEqual(['Openings'])
  })

  it('does not mutate what it was given', () => {
    const before = folders(['Openings'], { a: 'Openings' })
    assignFolder(before, 'b', 'Endgames')
    expect(before).toEqual({ names: ['Openings'], of: { a: 'Openings' } })
  })
})

describe('renameFolder', () => {
  it('takes every study in it along', () => {
    const after = renameFolder(folders(['Old', 'Other'], { a: 'Old', b: 'Other', c: 'Old' }), 'Old', 'New')
    expect(after.names).toEqual(['New', 'Other'])
    expect(after.of).toEqual({ a: 'New', b: 'Other', c: 'New' })
  })

  it('renames an empty folder', () => {
    expect(renameFolder(folders(['Old']), 'Old', 'New').names).toEqual(['New'])
  })

  it('merges when renamed onto a folder that already exists', () => {
    // Two folders reading the same is worse than the merge the reader asked
    // for by typing the name.
    const after = renameFolder(folders(['A', 'B'], { x: 'A', y: 'B' }), 'A', 'B')
    expect(after.names).toEqual(['B'])
    expect(after.of).toEqual({ x: 'B', y: 'B' })
  })

  it('refuses a name that is not one, and a folder that is not there', () => {
    const before = folders(['Old'])
    expect(renameFolder(before, 'Old', '  ')).toBe(before)
    expect(renameFolder(before, 'Nope', 'New')).toBe(before)
  })
})

describe('removeFolder', () => {
  it('unfiles its studies rather than deleting them', () => {
    const after = removeFolder(folders(['Gone', 'Kept'], { a: 'Gone', b: 'Kept' }), 'Gone')
    expect(after.names).toEqual(['Kept'])
    expect(after.of).toEqual({ b: 'Kept' })
  })

  it('removes an empty folder', () => {
    expect(removeFolder(folders(['Gone']), 'Gone').names).toEqual([])
  })
})

describe('pruneFolders', () => {
  it('drops a membership for a study the listing no longer has', () => {
    const after = pruneFolders(folders(['Openings'], { a: 'Openings', gone: 'Openings' }), ['a'])
    expect(after.of).toEqual({ a: 'Openings' })
  })

  it('keeps the folder even when its last study has gone', () => {
    // A study deleted on lichess.org is no reason to throw away the folder it
    // happened to be the last member of.
    const after = pruneFolders(folders(['Openings'], { gone: 'Openings' }), [])
    expect(after.names).toEqual(['Openings'])
    expect(after.of).toEqual({})
  })
})

describe('countIn and foldersOf', () => {
  const f = folders(['Endgames', 'Openings'], { a: 'Openings', b: 'Openings', c: 'Endgames' })

  it('counts a folder against the studies that exist', () => {
    expect(countIn(f, 'Openings', ['a', 'b', 'c'])).toBe(2)
    expect(countIn(f, 'Openings', ['a'])).toBe(1)
    expect(countIn(f, 'Empty', ['a', 'b'])).toBe(0)
  })

  it('lists folders in reading order, empty ones included', () => {
    expect(foldersOf(folders(['zeta', 'Alpha']))).toEqual(['Alpha', 'zeta'])
  })
})

describe('matchesFilter', () => {
  const f = folders(['Endgames', 'Openings'], { a: 'Openings', b: 'Endgames' })

  it('lets everything through for "all"', () => {
    expect(matchesFilter(f, 'c', { kind: 'all' })).toBe(true)
  })

  it('finds the unfiled ones', () => {
    expect(matchesFilter(f, 'c', { kind: 'unfiled' })).toBe(true)
    expect(matchesFilter(f, 'a', { kind: 'unfiled' })).toBe(false)
  })

  it('finds one folder', () => {
    expect(matchesFilter(f, 'a', { kind: 'named', name: 'Openings' })).toBe(true)
    expect(matchesFilter(f, 'b', { kind: 'named', name: 'Openings' })).toBe(false)
  })
})

describe('filterIsStale', () => {
  it('notices a folder that has been deleted', () => {
    const after = removeFolder(folders(['Gone']), 'Gone')
    expect(filterIsStale(after, { kind: 'named', name: 'Gone' })).toBe(true)
  })

  it('is not stale for a folder that is merely empty', () => {
    // The difference the folder list buys: an empty folder is still a place.
    expect(filterIsStale(folders(['Empty']), { kind: 'named', name: 'Empty' })).toBe(false)
  })

  it('is never stale for all or unfiled, which always exist', () => {
    expect(filterIsStale(EMPTY_FOLDERS, { kind: 'all' })).toBe(false)
    expect(filterIsStale(EMPTY_FOLDERS, { kind: 'unfiled' })).toBe(false)
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
    const f = folders(['Empty', 'Openings'], { a: 'Openings' })
    saveFolders(f)
    expect(loadFolders()).toEqual(f)
  })

  it('is empty when nothing has been stored', () => {
    expect(loadFolders()).toEqual(EMPTY_FOLDERS)
  })

  it('reads the shape folders had before they were objects', () => {
    // Anyone who filed a study in slice 4 has a bare id-to-name map. Reading
    // that as "no folders at all" would quietly lose their grouping.
    localStorage.setItem('chesspique.folders', JSON.stringify({ a: 'Openings', b: 'Endgames' }))
    expect(loadFolders()).toEqual({
      names: ['Endgames', 'Openings'],
      of: { a: 'Openings', b: 'Endgames' },
    })
  })

  it('names a folder a membership mentions but the list forgot', () => {
    localStorage.setItem(
      'chesspique.folders',
      JSON.stringify({ names: [], of: { a: 'Orphan' } }),
    )
    expect(loadFolders()).toEqual({ names: ['Orphan'], of: { a: 'Orphan' } })
  })

  it('survives a corrupted value and one of the wrong shape', () => {
    localStorage.setItem('chesspique.folders', '{not json')
    expect(loadFolders()).toEqual(EMPTY_FOLDERS)
    localStorage.setItem('chesspique.folders', JSON.stringify(['Openings']))
    expect(loadFolders()).toEqual(EMPTY_FOLDERS)
  })

  it('drops entries that are not names rather than the whole map', () => {
    localStorage.setItem(
      'chesspique.folders',
      JSON.stringify({ names: ['Ok', 42], of: { a: 'Openings', b: 7, c: '  ' } }),
    )
    expect(loadFolders()).toEqual({ names: ['Ok', 'Openings'], of: { a: 'Openings' } })
  })

  it('carries the value across from the old key name', () => {
    localStorage.setItem('chessnoter.folders', JSON.stringify({ names: ['X'], of: {} }))
    expect(loadFolders()).toEqual({ names: ['X'], of: {} })
    expect(localStorage.getItem('chessnoter.folders')).toBeNull()
  })
})
