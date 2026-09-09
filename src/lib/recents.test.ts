import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  loadRecentGames,
  loadRecentStudies,
  prunedStudies,
  RECENTS_KEPT,
  saveRecentGames,
  saveRecentStudies,
  withoutGame,
  withoutStudies,
  withRecentGame,
  withRecentStudy,
} from './recents'
import type { RecentGame, RecentStudy } from './recents'

const game = (studyId: string, chapterId: string, openedAt = 0): RecentGame => ({
  studyId,
  chapterId,
  studyName: `Study ${studyId}`,
  chapterName: `Chapter ${chapterId}`,
  openedAt,
})

const study = (studyId: string, openedAt = 0): RecentStudy => ({
  studyId,
  studyName: `Study ${studyId}`,
  openedAt,
})

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

describe('withRecentGame', () => {
  it('puts the newest first', () => {
    const list = withRecentGame([game('a', '1')], game('b', '2'))
    expect(list.map((g) => g.chapterId)).toEqual(['2', '1'])
  })

  it('moves a game already listed rather than repeating it', () => {
    const list = withRecentGame([game('a', '1'), game('b', '2')], game('b', '2', 99))
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ chapterId: '2', openedAt: 99 })
  })

  it('tells two chapters of one study apart', () => {
    const list = withRecentGame([game('a', '1')], game('a', '2'))
    expect(list).toHaveLength(2)
  })

  it('keeps only the most recent few', () => {
    let list: RecentGame[] = []
    for (let i = 0; i < RECENTS_KEPT + 5; i++) list = withRecentGame(list, game('s', `c${i}`))
    expect(list).toHaveLength(RECENTS_KEPT)
    expect(list[0].chapterId).toBe(`c${RECENTS_KEPT + 4}`)
  })
})

describe('withRecentStudy', () => {
  it('moves a study already listed rather than repeating it', () => {
    const list = withRecentStudy([study('a'), study('b')], study('a', 99))
    expect(list.map((s) => s.studyId)).toEqual(['a', 'b'])
    expect(list[0].openedAt).toBe(99)
  })
})

describe('pruning', () => {
  it('drops one game that would not open', () => {
    const list = withoutGame([game('a', '1'), game('a', '2')], 'a', '1')
    expect(list.map((g) => g.chapterId)).toEqual(['2'])
  })

  it('drops every game of a study that has gone', () => {
    // A study's absence from the listing is the only notice of its deletion,
    // and its chapters cannot outlive it in a list that offers to open them.
    const list = withoutStudies([game('a', '1'), game('b', '1'), game('a', '2')], ['a'])
    expect(list.map((g) => g.studyId)).toEqual(['b'])
  })

  it('keeps only studies the listing still has', () => {
    expect(prunedStudies([study('a'), study('gone')], ['a', 'b']).map((s) => s.studyId)).toEqual([
      'a',
    ])
  })
})

describe('storage', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage()
  })
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('round-trips both lists', () => {
    saveRecentGames([game('a', '1', 5)])
    saveRecentStudies([study('a', 5)])
    expect(loadRecentGames()).toEqual([game('a', '1', 5)])
    expect(loadRecentStudies()).toEqual([study('a', 5)])
  })

  it('is empty when nothing has been stored', () => {
    expect(loadRecentGames()).toEqual([])
    expect(loadRecentStudies()).toEqual([])
  })

  it('survives a corrupted value', () => {
    localStorage.setItem('chesspique.recent-games', '{not json')
    expect(loadRecentGames()).toEqual([])
  })

  it('survives a value of the wrong shape', () => {
    localStorage.setItem('chesspique.recent-games', JSON.stringify({ studyId: 'a' }))
    expect(loadRecentGames()).toEqual([])
  })

  it('drops entries that are not games rather than the whole list', () => {
    localStorage.setItem(
      'chesspique.recent-games',
      JSON.stringify([game('a', '1'), null, { nope: true }]),
    )
    expect(loadRecentGames()).toEqual([game('a', '1')])
  })

  it('carries the value across from the old key name', () => {
    // Every key goes through readStored, or the rename that key missed is the
    // one that silently loses its history.
    localStorage.setItem('chessnoter.recent-games', JSON.stringify([game('a', '1')]))
    expect(loadRecentGames()).toEqual([game('a', '1')])
    expect(localStorage.getItem('chessnoter.recent-games')).toBeNull()
  })
})
