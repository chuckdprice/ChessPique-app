import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ConvertError,
  convertPgn,
  formatClockTime,
  parseClockTime,
  parseTimecontrolHeader,
} from './convert'
import { buildChartRows, clockAtPly, replayGame } from './gameModel'

const root = join(__dirname, '..', '..')
const samplePgn = readFileSync(
  join(root, 'Price-Lopez-DCC July Tuesday Tournament-4-2026.07.28.pgn'),
  'utf-8',
)
const expectedPgn = readFileSync(join(root, 'converted_game.pgn'), 'utf-8')

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
