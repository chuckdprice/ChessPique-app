import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chapterIdOf, splitGames, studyIdOf, summarize, tagsOf } from './multiPgn'

/**
 * A real two-chapter export from `GET /api/study/{id}.pgn`, kept rather than
 * hand-written: the tags Lichess adds on the way out — StudyName, ChapterName,
 * ChapterURL — are the whole reason this module exists, and a fixture invented
 * here would only prove that the parser agrees with my idea of the format.
 */
const studyExport = readFileSync(
  join(__dirname, '__fixtures__', 'lichess_study_export.pgn'),
  'utf8',
)

describe('splitGames', () => {
  it('splits a real study export into its chapters', () => {
    const games = splitGames(studyExport)
    expect(games).toHaveLength(2)
    expect(games[0]).toContain('[ChapterURL "https://lichess.org/study/1UmQwWtW/kq3IdtQg"]')
    expect(games[1]).toContain('[ChapterURL "https://lichess.org/study/1UmQwWtW/rzfBdxqv"]')
  })

  it('leaves each game a complete PGN', () => {
    const [first] = splitGames(studyExport)
    expect(first.startsWith('[Event ')).toBe(true)
    expect(first).toContain('1. g3')
    expect(first.trimEnd().endsWith('1/2-1/2')).toBe(true)
  })

  it('returns a single-game file unchanged', () => {
    const one = '[Event "Solo"]\n[Result "*"]\n\n1. e4 e5 *\n'
    expect(splitGames(one)).toEqual(['[Event "Solo"]\n[Result "*"]\n\n1. e4 e5 *'])
  })

  it('ignores an empty file', () => {
    expect(splitGames('')).toEqual([])
    expect(splitGames('\n\n  \n')).toEqual([])
  })

  it('does not cut a game at a comment pushed onto its own line', () => {
    // The greedy wrap in formatTreeMovetext can put a whole comment token on a
    // line by itself; a looser "starts with [" test would split here.
    const pgn = ['[Event "Wrapped"]', '', '1. e4', '{[%eval 0.25] [%clk 0:30:00]}', '1... e5 *'].join(
      '\n',
    )
    expect(splitGames(pgn)).toHaveLength(1)
  })

  it('splits two games that have no movetext between them', () => {
    // A chapter can hold a position and no moves, so there is no movetext to
    // mark the boundary — the repeated tag name is what gives it away.
    const pgn = '[Event "A"]\n[Result "*"]\n[Event "B"]\n[Result "*"]\n'
    const games = splitGames(pgn)
    expect(games).toHaveLength(2)
    expect(tagsOf(games[0]).get('Event')).toBe('A')
    expect(tagsOf(games[1]).get('Event')).toBe('B')
  })

  it('handles CRLF line endings', () => {
    const pgn = '[Event "A"]\r\n\r\n1. e4 *\r\n\r\n[Event "B"]\r\n\r\n1. d4 *\r\n'
    expect(splitGames(pgn)).toHaveLength(2)
  })
})

describe('chapter identity', () => {
  it('reads the chapter and study ids off ChapterURL', () => {
    const [first] = splitGames(studyExport)
    expect(chapterIdOf(first)).toBe('kq3IdtQg')
    expect(studyIdOf(first)).toBe('1UmQwWtW')
  })

  it('is null for a game that did not come from a study', () => {
    const pgn = '[Event "Solo"]\n\n1. e4 *\n'
    expect(chapterIdOf(pgn)).toBeNull()
    expect(studyIdOf(pgn)).toBeNull()
  })
})

describe('summarize', () => {
  it('reads a game list entry from the tags alone', () => {
    const [first] = splitGames(studyExport)
    expect(summarize(first)).toMatchObject({
      chapterId: 'kq3IdtQg',
      chapterName: 'HELMUT_LANG (2817) - FM dau_npukypumb (2987)',
      white: 'HELMUT_LANG',
      black: 'dau_npukypumb',
      result: '1/2-1/2',
    })
  })

  it('treats PGN\'s "?" for unknown as absent', () => {
    const pgn = '[White "?"]\n[Black "Smith"]\n\n1. e4 *\n'
    const summary = summarize(pgn)
    expect(summary.white).toBeNull()
    expect(summary.black).toBe('Smith')
  })
})
