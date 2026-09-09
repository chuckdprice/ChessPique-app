import { describe, expect, it } from 'vitest'
import {
  allTags,
  cleanTag,
  matchesTagQuery,
  parseTags,
  suggestTags,
  TAG_MAX,
  tagsInPgn,
  withoutTag,
  withTag,
  writeTags,
} from './tags'

describe('cleanTag', () => {
  it('takes the grammar as written', () => {
    expect(cleanTag('#dcc-2026')).toBe('dcc-2026')
    expect(cleanTag('karpov')).toBe('karpov')
    expect(cleanTag('#rook-endgame')).toBe('rook-endgame')
  })

  it('folds case rather than refusing it', () => {
    // A difference the grammar does not keep is not worth an error message.
    expect(cleanTag('#Karpov')).toBe('karpov')
    expect(cleanTag('#DCC-2026')).toBe('dcc-2026')
  })

  it('refuses a space, because two ideas cannot be guessed apart', () => {
    expect(cleanTag('#rook endgame')).toBeNull()
    expect(cleanTag('rook endgame')).toBeNull()
  })

  it('refuses punctuation outside the grammar', () => {
    expect(cleanTag('#rook_endgame')).toBeNull()
    expect(cleanTag('#rook.endgame')).toBeNull()
    expect(cleanTag('#café')).toBeNull()
    expect(cleanTag('#')).toBeNull()
    expect(cleanTag('')).toBeNull()
  })

  it('refuses a hyphen with nothing on one side of it', () => {
    expect(cleanTag('#-lead')).toBeNull()
    expect(cleanTag('#trail-')).toBeNull()
    expect(cleanTag('#two--hyphens')).toBeNull()
  })

  it('has a length limit', () => {
    expect(cleanTag('#' + 'a'.repeat(TAG_MAX))).toHaveLength(TAG_MAX)
    expect(cleanTag('#' + 'a'.repeat(TAG_MAX + 1))).toBeNull()
  })
})

describe('parseTags', () => {
  it('reads a comment that is only tags', () => {
    expect(parseTags('#karpov #endgame')).toEqual({ tags: ['karpov', 'endgame'], prose: '' })
  })

  it('keeps prose and tags apart', () => {
    expect(parseTags('A tough one.\n#karpov #endgame')).toEqual({
      tags: ['karpov', 'endgame'],
      prose: 'A tough one.',
    })
  })

  it('leaves a "#1" inside a sentence alone', () => {
    // The whole reason tags live on their own last line rather than being
    // scraped from anywhere in the comment.
    const note = 'Won the last round and finished #1 in the section.'
    expect(parseTags(note)).toEqual({ tags: [], prose: note })
  })

  it('does not take a last line that is only partly tags', () => {
    const note = 'Played well #karpov would have approved'
    expect(parseTags(note)).toEqual({ tags: [], prose: note })
  })

  it('handles no comment at all', () => {
    expect(parseTags(null)).toEqual({ tags: [], prose: '' })
    expect(parseTags('')).toEqual({ tags: [], prose: '' })
    expect(parseTags('   \n  ')).toEqual({ tags: [], prose: '' })
  })

  it('drops a repeated tag', () => {
    expect(parseTags('#karpov #karpov').tags).toEqual(['karpov'])
  })

  it('finds tags the converter has reflowed onto one line', () => {
    // humanComment collapses every run of whitespace, so a comment written
    // with a newline before its tags comes back with a space. A rule that
    // needed the line lost every tag on the first re-read — measured, not
    // imagined.
    expect(parseTags('A tough one. #karpov #rook-endgame')).toEqual({
      tags: ['karpov', 'rook-endgame'],
      prose: 'A tough one.',
    })
  })

  it('keeps several lines of prose', () => {
    expect(parseTags('One.\nTwo.\n#tag')).toEqual({ tags: ['tag'], prose: 'One.\nTwo.' })
  })
})

describe('writeTags', () => {
  it('puts the tags on a line of their own, last', () => {
    expect(writeTags('A tough one.', ['karpov', 'endgame'])).toBe('A tough one.\n#karpov #endgame')
  })

  it('writes tags alone when there is no prose', () => {
    expect(writeTags('', ['karpov'])).toBe('#karpov')
  })

  it('writes prose alone when there are no tags', () => {
    expect(writeTags('A tough one.', [])).toBe('A tough one.')
  })

  it('is empty when there is neither', () => {
    expect(writeTags('', [])).toBe('')
  })

  it('drops anything that is not a tag rather than writing it', () => {
    expect(writeTags('', ['ok', 'not a tag', '#Also-OK'])).toBe('#ok #also-ok')
  })

  it('round-trips through parseTags', () => {
    const cases: Array<[string, string[]]> = [
      ['A tough one.', ['karpov', 'dcc-2026']],
      ['', ['solo']],
      ['Prose only.', []],
      ['Two\nlines.', ['a', 'b']],
    ]
    for (const [prose, tags] of cases) {
      expect(parseTags(writeTags(prose, tags))).toEqual({ prose, tags })
    }
  })
})

describe('withTag and withoutTag', () => {
  it('adds one, cleaning it on the way in', () => {
    expect(withTag(['a'], '#B')).toEqual(['a', 'b'])
  })

  it('ignores one already there, and one that is not a tag', () => {
    expect(withTag(['a'], 'a')).toEqual(['a'])
    expect(withTag(['a'], 'no spaces here')).toEqual(['a'])
  })

  it('removes one', () => {
    expect(withoutTag(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('tagsInPgn', () => {
  const pgn = (movetext: string) =>
    `[Event "E"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n${movetext}\n`

  it('reads the root comment without replaying the moves', () => {
    expect(tagsInPgn(pgn('{ #karpov #endgame } 1. e4 e5 *'))).toEqual(['karpov', 'endgame'])
  })

  it('reads tags under prose', () => {
    expect(tagsInPgn(pgn('{ A tough one.\n#karpov } 1. e4 *'))).toEqual(['karpov'])
  })

  it('is empty for a game with no root comment', () => {
    expect(tagsInPgn(pgn('1. e4 e5 *'))).toEqual([])
  })

  it('ignores a comment that is not the first thing in the movetext', () => {
    // A comment on a move is that move's, not the game's.
    expect(tagsInPgn(pgn('1. e4 { #karpov } e5 *'))).toEqual([])
  })

  it('is empty for something that is not a PGN', () => {
    expect(tagsInPgn('')).toEqual([])
    expect(tagsInPgn('nonsense')).toEqual([])
  })
})

describe('allTags', () => {
  it('lists each tag once, sorted', () => {
    expect(
      allTags([{ tags: ['b', 'a'] }, { tags: ['a', 'c'] }, { tags: [] }]),
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('matchesTagQuery', () => {
  const tags = ['rook-endgame', 'dcc-2026', 'karpov']

  it('matches everything when nothing is typed', () => {
    expect(matchesTagQuery(tags, '')).toBe(true)
    expect(matchesTagQuery([], '   ')).toBe(true)
  })

  it('matches a whole tag, with or without the hash', () => {
    expect(matchesTagQuery(tags, '#karpov')).toBe(true)
    expect(matchesTagQuery(tags, 'karpov')).toBe(true)
  })

  it('matches a tag being typed', () => {
    expect(matchesTagQuery(tags, '#rook')).toBe(true)
    expect(matchesTagQuery(tags, '#roo')).toBe(true)
  })

  it('narrows rather than widens with a second word', () => {
    expect(matchesTagQuery(tags, '#rook #dcc')).toBe(true)
    expect(matchesTagQuery(tags, '#rook #fischer')).toBe(false)
  })

  it('does not match the middle of a tag', () => {
    expect(matchesTagQuery(tags, 'endgame')).toBe(false)
  })
})

describe('suggestTags', () => {
  const known = ['dcc-2026', 'karpov', 'kasparov']

  it('offers everything before anything is typed', () => {
    expect(suggestTags(known, '')).toEqual(known)
  })

  it('narrows as it is typed', () => {
    expect(suggestTags(known, '#ka')).toEqual(['karpov', 'kasparov'])
    expect(suggestTags(known, 'kar')).toEqual(['karpov'])
  })

  it('stops offering a tag once it has been typed in full', () => {
    // Suggesting exactly what is in the box is a row that does nothing.
    expect(suggestTags(known, 'karpov')).toEqual([])
  })
})
