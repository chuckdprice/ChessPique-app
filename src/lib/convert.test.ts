import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildPgn,
  ConvertError,
  convertPgn,
  formatClockTime,
  parseClockTime,
  parseTimecontrolHeader,
  withExtraTags,
} from './convert'
import { buildChartRows, clockAtPly, replayGame } from './gameModel'

const fixtures = join(__dirname, '__fixtures__')
const samplePgn = readFileSync(
  join(fixtures, 'Price-Lopez-DCC July Tuesday Tournament-4-2026.07.28.pgn'),
  'utf-8',
)
const expectedPgn = readFileSync(join(fixtures, 'converted_game.pgn'), 'utf-8')

describe('parseClockTime', () => {
  it('parses h:mm:ss', () => {
    expect(parseClockTime('1:07:00')).toBe(4020)
  })
  it('parses mm:ss as minutes when bare', () => {
    expect(parseClockTime('56:00', true)).toBe(3360)
  })
  it('rejects invalid values', () => {
    expect(() => parseClockTime('1:99:00')).toThrow(ConvertError)
  })
})

describe('formatClockTime', () => {
  it('formats seconds as h:mm:ss', () => {
    expect(formatClockTime(4020)).toBe('1:07:00')
    expect(formatClockTime(0)).toBe('0:00:00')
    expect(formatClockTime(-5)).toBe('0:00:00')
  })
})

describe('parseTimecontrolHeader', () => {
  it('parses ChessNoteR delay style', () => {
    expect(parseTimecontrolHeader('G70/d10')).toEqual({
      startSeconds: 4200,
      mode: 'delay',
      amountSeconds: 10,
    })
  })
  it('parses ChessNoteR increment style', () => {
    expect(parseTimecontrolHeader('G90+30')).toEqual({
      startSeconds: 5400,
      mode: 'increment',
      amountSeconds: 30,
    })
  })
  it('parses standard notations', () => {
    expect(parseTimecontrolHeader('4200d10')?.mode).toBe('delay')
    expect(parseTimecontrolHeader('5400+30')?.mode).toBe('increment')
    expect(parseTimecontrolHeader('3600')?.mode).toBe('none')
    expect(parseTimecontrolHeader('?')).toBeNull()
  })
})

describe('convertPgn on the ChessNoteR sample game', () => {
  const result = convertPgn(samplePgn)

  it('matches the reference converter movetext exactly', () => {
    // converted_game.pgn was produced by chessnoter_clk_convert.py (its
    // player-name headers were later hand-edited, so compare movetext only).
    const expectedMovetext = expectedPgn.split('\n\n')[1].trim()
    const actualMovetext = result.pgn.split('\n\n')[1].trim()
    expect(actualMovetext).toBe(expectedMovetext)
  })

  it('normalizes the TimeControl header', () => {
    expect(result.headers.find((h) => h.name === 'TimeControl')?.value).toBe('4200d10')
  })

  it('parses all 57 plies and the result', () => {
    expect(result.moves).toHaveLength(57)
    expect(result.result).toBe('1-0')
    expect(result.warnings).toHaveLength(0)
  })

  it('honors bare clock anchors over computed values', () => {
    const ne5 = result.moves.find((m) => m.san === 'Ne5')
    expect(ne5?.clkSeconds).toBe(4020) // {1:07:00} anchor
    const f4 = result.moves.find((m) => m.san === 'f4')
    expect(f4?.clkSeconds).toBe(3360) // {56:00} anchor
  })

  it('replays cleanly to checkmate', () => {
    const { fens } = replayGame(result.moves)
    expect(fens).toHaveLength(58)
  })

  it('reports each side’s remaining clock at a given ply', () => {
    const { moves } = result
    const start = result.timeControl.startSeconds // 4200

    // Before anyone has moved, both clocks read the full time control.
    expect(clockAtPly(moves, 0, 'w', start)).toBe(4200)
    expect(clockAtPly(moves, 0, 'b', start)).toBe(4200)

    // After White's 1. d4 (ply 1), Black still has the full clock.
    expect(clockAtPly(moves, 1, 'w', start)).toBe(moves[0].clkSeconds)
    expect(clockAtPly(moves, 1, 'b', start)).toBe(4200)

    // Mid-game: each side shows its own most recent clock.
    const ply = 16 // after 8... Ng4
    expect(clockAtPly(moves, ply, 'w', start)).toBe(4020) // 8. Ne5 anchor {1:07:00}
    expect(clockAtPly(moves, ply, 'b', start)).toBe(moves[15].clkSeconds)

    // Past the final move, the last known clock persists for both.
    expect(clockAtPly(moves, moves.length, 'w', start)).toBe(1607) // 29. Qb7# 0:26:47
    expect(clockAtPly(moves, moves.length, 'b', start)).toBe(3013) // 28... Kb8 0:50:13
  })

  it('builds one chart row per move number', () => {
    const rows = buildChartRows(result.moves)
    expect(rows).toHaveLength(29)
    expect(rows[28].whiteSan).toBe('Qb7#')
    expect(rows[28].blackSan).toBeNull()
  })
})

describe('convertPgn edge cases', () => {
  it('applies increment rules', () => {
    const pgn = [
      '[TimeControl "G5+10"]',
      '',
      '1. e4 {[%emt 0:00:04]} e5 {[%emt 0:00:30]} *',
    ].join('\n')
    const { moves } = convertPgn(pgn)
    // 4s move within 10s increment: 300 + (10 - 4) = 306
    expect(moves[0].clkSeconds).toBe(306)
    // 30s move beyond increment: 300 - 30 = 270
    expect(moves[1].clkSeconds).toBe(270)
  })

  it('warns and reuses the clock when timing is missing', () => {
    const pgn = ['[TimeControl "G5"]', '', '1. e4 e5 {[%emt 0:00:30]} *'].join('\n')
    const { moves, warnings } = convertPgn(pgn)
    expect(warnings).toHaveLength(1)
    expect(moves[0].clkSeconds).toBe(300)
  })

  it('accepts manual overrides when the header is missing', () => {
    const pgn = '1. e4 {[%emt 0:00:30]} *'
    expect(() => convertPgn(pgn)).toThrow(ConvertError)
    const { moves, timeControl } = convertPgn(pgn, { startMinutes: 70, delay: 10 })
    expect(timeControl).toEqual({ startSeconds: 4200, mode: 'delay', amountSeconds: 10 })
    expect(moves[0].clkSeconds).toBe(4200 - 30)
  })

  it('rejects a PGN with no moves', () => {
    expect(() => convertPgn('[Event "x"]\n[TimeControl "G5"]\n\n')).toThrow(ConvertError)
  })
})

describe('PGNs that already carry %clk', () => {
  const clkOnly = [
    '[TimeControl "4200d10"]',
    '',
    '1. d4 {[%clk 1:10:00]} d5 {[%clk 1:09:48]}',
    '2. Nf3 {[%clk 1:09:56]} e6 {[%clk 1:09:33]}',
    '*',
  ].join('\n')

  it('keeps the anchored clocks', () => {
    const { moves } = convertPgn(clkOnly)
    expect(moves.map((m) => m.clkSeconds)).toEqual([4200, 4188, 4196, 4173])
  })

  it('reconstructs time spent from the clock drop plus the delay', () => {
    const { moves } = convertPgn(clkOnly)
    // White never moved the clock on move 1, so the move cost at most the delay.
    expect(moves[0].spentSeconds).toBe(10)
    // Black dropped 12s on top of the 10s delay.
    expect(moves[1].spentSeconds).toBe(4200 - 4188 + 10)
    // White dropped 4s from 4200 the next move.
    expect(moves[2].spentSeconds).toBe(4200 - 4196 + 10)
    expect(moves[3].spentSeconds).toBe(4188 - 4173 + 10)
  })

  it('adds the increment back when reconstructing', () => {
    const pgn = ['[TimeControl "300+30"]', '', '1. e4 {[%clk 0:05:20]} *'].join('\n')
    const { moves } = convertPgn(pgn)
    // Clock rose 20s under a 30s increment, so the move took 10s.
    expect(moves[0].spentSeconds).toBe(300 - 320 + 30)
  })

  it('prefers an explicit %emt over the reconstruction', () => {
    const pgn = [
      '[TimeControl "4200d10"]',
      '',
      '1. d4 {[%emt 0:00:25]} {[%clk 1:09:35]} *',
    ].join('\n')
    const { moves } = convertPgn(pgn)
    expect(moves[0].spentSeconds).toBe(25)
  })

  it('needs no time control when every clock is an anchor', () => {
    const pgn = '1. d4 {[%clk 1:10:00]} d5 {[%clk 1:09:48]} *'
    const { moves, timeControl } = convertPgn(pgn)
    expect(timeControl).toBeNull()
    expect(moves[0].clkSeconds).toBe(4200)
  })
})

describe('PGNs with no timing at all', () => {
  const bare = '[Event "Bare"]\n[Result "*"]\n\n1. d4 d5 2. Nf3 Nf6 *'

  it('converts without a time control instead of throwing', () => {
    const { moves, timeControl, warnings } = convertPgn(bare)
    expect(timeControl).toBeNull()
    expect(moves).toHaveLength(4)
    expect(warnings).toEqual([])
    expect(moves.every((m) => m.clkSeconds == null)).toBe(true)
    expect(moves.every((m) => m.spentSeconds == null)).toBe(true)
  })

  it('emits no %clk comments', () => {
    const { pgn } = convertPgn(bare)
    expect(pgn).not.toContain('%clk')
    expect(pgn).toContain('1. d4 d5')
  })

  it('stays unclocked even when a TimeControl header is present', () => {
    const pgn = '[TimeControl "4200d10"]\n\n1. d4 d5 *'
    const { moves, pgn: out } = convertPgn(pgn)
    expect(moves.every((m) => m.clkSeconds == null)).toBe(true)
    expect(out).not.toContain('%clk')
  })

  it('still refuses a bare %emt game with no starting clock', () => {
    expect(() => convertPgn('1. e4 {[%emt 0:00:30]} *')).toThrow(ConvertError)
  })
})

describe('move comments', () => {
  const annotated =
    '[TimeControl "4200d10"]\n\n' +
    '1. d4 {[%emt 0:00:10]} d5 {[%emt 0:00:12] a solid reply} ' +
    '2. Nf3 {2:00:00} Nc6 {[%emt 0:00:08]} *'

  it('keeps the prose and drops the timing commands around it', () => {
    const { moves } = convertPgn(annotated)
    expect(moves[1].comment).toBe('a solid reply')
    expect(moves[0].comment).toBeNull()
  })

  it('reads a bare clock as timing, not as a comment', () => {
    const { moves } = convertPgn(annotated)
    expect(moves[2].comment).toBeNull()
    expect(moves[2].clkSeconds).toBe(2 * 3600)
  })

  it('leaves comments out unless they are asked for', () => {
    const { moves, result, pgn } = convertPgn(annotated)
    expect(pgn).not.toContain('a solid reply')
    const withComments = buildPgn([], moves, result, { comments: true })
    expect(withComments).toContain('{[%clk 1:09:48] a solid reply}')
  })

  it('strips a stray brace that would corrupt the comment it is written into', () => {
    const { moves, result } = convertPgn('1. e4 {a {curly comment} *')
    expect(buildPgn([], moves, result, { comments: true })).toContain('1. e4 {a curly comment}')
  })
})

describe('eval comments', () => {
  it('writes the eval ahead of the clock on the move it belongs to', () => {
    const { moves, result } = convertPgn('[TimeControl "4200d10"]\n\n1. d4 {[%emt 0:00:10]} d5 *')
    const pgn = buildPgn([], moves, result, { evals: ['0.25', '#-3'] })
    expect(pgn).toContain('1. d4 {[%eval 0.25] [%clk 1:10:00]}')
    expect(pgn).toContain('d5 {[%eval #-3] [%clk 1:10:00]}')
  })

  it('leaves a move bare when it has neither an eval nor a clock', () => {
    const { moves, result } = convertPgn('1. d4 d5 *')
    expect(buildPgn([], moves, result, { evals: [null, null] })).toContain('1. d4 d5')
  })
})

describe('withExtraTags', () => {
  const headers = [
    { name: 'Event', value: 'Club night' },
    { name: 'ECO', value: 'A00' },
  ]

  it('appends a tag the game does not have, at the end', () => {
    const merged = withExtraTags(headers, [{ name: 'Annotator', value: 'https://example.com/' }])
    expect(merged[merged.length - 1]).toEqual({
      name: 'Annotator',
      value: 'https://example.com/',
    })
  })

  it('overwrites a tag the game already has, in place', () => {
    const merged = withExtraTags(headers, [{ name: 'ECO', value: 'D02' }])
    expect(merged).toEqual([
      { name: 'Event', value: 'Club night' },
      { name: 'ECO', value: 'D02' },
    ])
  })

  it('leaves the headers it was given untouched', () => {
    withExtraTags(headers, [{ name: 'ECO', value: 'D02' }])
    expect(headers[1].value).toBe('A00')
  })
})

describe('engine notes and variations', () => {
  const game = convertPgn('[TimeControl "4200d10"]\n\n1. d4 {[%emt 0:00:10]} d5 2. Nf3 Nc6 *')

  it('writes the note in a comment of its own, apart from the source comment', () => {
    const pgn = buildPgn([], game.moves, game.result, {
      comments: true,
      notes: ['Inaccuracy. Nf3 was best.', null, null, null],
    })
    expect(pgn).toContain('1. d4 {[%clk 1:10:00]} {Inaccuracy. Nf3 was best.}')
  })

  it('writes the variation in parentheses after the move', () => {
    const pgn = buildPgn([], game.moves, game.result, {
      variations: ['1. Nf3 d5 2. d4', null, null, null],
    })
    expect(pgn).toContain('1. d4 {[%clk 1:10:00]} (1. Nf3 d5 2. d4)')
  })

  it("repeats the move number so Black's reply is unambiguous after a variation", () => {
    const pgn = buildPgn([], game.moves, game.result, {
      variations: ['1. Nf3 d5 2. d4', null, null, null],
    })
    expect(pgn).toContain('(1. Nf3 d5 2. d4) 1... d5')
    // Without one, the reply stays on the same line unprefixed as before.
    expect(buildPgn([], game.moves, game.result, {})).toContain('1. d4 {[%clk 1:10:00]} d5')
  })

  it('reads its own variations back as commentary, not as moves', () => {
    const pgn = buildPgn([], game.moves, game.result, {
      notes: ['Inaccuracy. Nf3 was best.', null, null, null],
      variations: ['1. Nf3 d5 2. d4 Nf6 3. c4', null, null, null],
      comments: true,
    })
    const reread = convertPgn(pgn)
    expect(reread.moves.map((m) => m.san)).toEqual(['d4', 'd5', 'Nf3', 'Nc6'])
  })

  it('keeps a nested variation out of the move list too', () => {
    const reread = convertPgn('1. e4 (1. d4 d5 (1... Nf6 2. c4) 2. Nf3) 1... e5 *')
    expect(reread.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
  })
})
