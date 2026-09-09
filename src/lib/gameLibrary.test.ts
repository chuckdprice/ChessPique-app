import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CACHE_SCHEMA, gameOf, parseStudy, staleStudyIds, vanishedStudyIds } from './gameLibrary'
import type { CachedStudy } from './gameLibrary'

const studyExport = readFileSync(
  join(__dirname, '__fixtures__', 'lichess_study_export.pgn'),
  'utf8',
)

const meta = (id: string, updatedAt: number) => ({
  id,
  name: `Study ${id}`,
  createdAt: 0,
  updatedAt,
})

const cached = (id: string, updatedAt: number): CachedStudy => ({
  schema: CACHE_SCHEMA,
  id,
  name: `Study ${id}`,
  updatedAt,
  fetchedAt: 0,
  games: [],
})

describe('parseStudy', () => {
  it('turns a study export into one entry per chapter', () => {
    const study = parseStudy(meta('1UmQwWtW', 99), studyExport, 1234)

    expect(study.id).toBe('1UmQwWtW')
    expect(study.updatedAt).toBe(99)
    expect(study.fetchedAt).toBe(1234)
    expect(study.games).toHaveLength(2)
    expect(study.games.map((g) => g.chapterId)).toEqual(['kq3IdtQg', 'rzfBdxqv'])
  })

  it('keeps each chapter\'s PGN whole, so it can be reopened without refetching', () => {
    const study = parseStudy(meta('1UmQwWtW', 99), studyExport, 0)

    expect(study.games[0].pgn).toContain('[Event ')
    expect(study.games[0].pgn).toContain('1. g3')
  })

  it('stamps the shape it was written in', () => {
    // Without this, a study cached before `tags` existed came back with games
    // missing the field, `game.tags.length` threw while rendering the list,
    // and the page went blank — for exactly the studies you had opened before.
    expect(parseStudy(meta('1UmQwWtW', 99), studyExport, 0).schema).toBe(CACHE_SCHEMA)
  })

  it('gives every game a tags array, even one with no root comment', () => {
    for (const game of parseStudy(meta('1UmQwWtW', 99), studyExport, 0).games) {
      expect(Array.isArray(game.tags)).toBe(true)
    }
  })

  it('reads the list columns off the tags', () => {
    const [first] = parseStudy(meta('1UmQwWtW', 99), studyExport, 0).games

    expect(first.white).toBe('HELMUT_LANG')
    expect(first.black).toBe('dau_npukypumb')
    expect(first.result).toBe('1/2-1/2')
  })
})

describe('staleStudyIds', () => {
  it('names a study never downloaded', () => {
    expect(staleStudyIds([meta('a', 10)], [])).toEqual(['a'])
  })

  it('names a study Lichess has touched since', () => {
    expect(staleStudyIds([meta('a', 20)], [cached('a', 10)])).toEqual(['a'])
  })

  it('says nothing about a study that has not changed', () => {
    expect(staleStudyIds([meta('a', 10)], [cached('a', 10)])).toEqual([])
  })

  it('refetches when updatedAt moved backwards rather than trusting it', () => {
    expect(staleStudyIds([meta('a', 5)], [cached('a', 10)])).toEqual(['a'])
  })

  it('checks each study on its own', () => {
    const listing = [meta('a', 10), meta('b', 20), meta('c', 30)]
    const have = [cached('a', 10), cached('b', 5)]

    expect(staleStudyIds(listing, have)).toEqual(['b', 'c'])
  })
})

describe('vanishedStudyIds', () => {
  it('names a cached study the listing no longer has', () => {
    // The only way a study goes away: deleted on lichess.org, since the API
    // offers no delete at all. Its absence is the only notice this app gets.
    expect(vanishedStudyIds([meta('a', 10)], [cached('a', 10), cached('gone', 1)])).toEqual(['gone'])
  })

  it('names nothing when every cached study is still listed', () => {
    expect(vanishedStudyIds([meta('a', 10)], [cached('a', 10)])).toEqual([])
  })
})

describe('gameOf', () => {
  const study = parseStudy(meta('1UmQwWtW', 99), studyExport, 0)

  it('finds a game by chapter id', () => {
    expect(gameOf(study, 'rzfBdxqv')?.chapterId).toBe('rzfBdxqv')
  })

  it('is null for a chapter that is not there, and for no study at all', () => {
    expect(gameOf(study, 'nosuchid')).toBeNull()
    expect(gameOf(null, 'rzfBdxqv')).toBeNull()
  })
})
