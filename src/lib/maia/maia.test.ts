import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import table from '../__fixtures__/all_moves_maia3.json'
import { POLICY_SIZE, moveIndex, uciFromIndex, squareIndex } from './moves'
import { encodePosition, mirrorFen, mirrorMove, TOKEN_LENGTH } from './encode'
import { decodePolicy, decodeValue } from './decode'
import { predictMoves, nearestRating, MAIA_RATINGS } from './model'
import type { ModelRunner } from './model'
import {
  firstMoves,
  movesToSearch,
  verdictsForMoves,
  isColoured,
  colourSearchMs,
} from './verdicts'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

const moveTable = table as Record<string, number>

describe('policy move space', () => {
  // The point of the fixture: Maia's own table, entry for entry, against the
  // formula we derived from it. If a future model renumbers the space this
  // fails rather than silently returning someone else's move.
  it('agrees with the table Maia ships, in both directions', () => {
    expect(Object.keys(moveTable)).toHaveLength(POLICY_SIZE)
    for (const [uci, index] of Object.entries(moveTable)) {
      expect(moveIndex(uci)).toBe(index)
      expect(uciFromIndex(index)).toBe(uci)
    }
  })

  it('rejects moves outside the space', () => {
    expect(moveIndex('e2e9')).toBe(-1)
    expect(moveIndex('z2e4')).toBe(-1)
    // A promotion has to be to a piece Maia models, on the only rank it can be
    // on once the position is mirrored.
    expect(moveIndex('a7a8k')).toBe(-1)
    expect(moveIndex('a2a1q')).toBe(-1)
  })

  it('indexes squares from a1', () => {
    expect(squareIndex('a1')).toBe(0)
    expect(squareIndex('h8')).toBe(63)
    expect(squareIndex('e4')).toBe(28)
  })
})

describe('mirroring', () => {
  it('is its own inverse', () => {
    expect(mirrorFen(mirrorFen(AFTER_E4))).toBe(AFTER_E4)
    expect(mirrorMove(mirrorMove('e2e4'))).toBe('e2e4')
  })

  it('turns the position the other way up', () => {
    expect(mirrorFen(AFTER_E4)).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1',
    )
    expect(mirrorMove('e7e5')).toBe('e2e4')
    expect(mirrorMove('a7a8q')).toBe('a2a1q')
  })

  it('keeps castling rights with their side', () => {
    const black = mirrorFen('4k3/8/8/8/8/8/8/4K2R b K - 0 1')
    expect(black.split(' ')[2]).toBe('k')
  })
})

describe('encoding', () => {
  it('lays the start position out as 64 squares of 12 planes', () => {
    const { tokens } = encodePosition(START)
    expect(tokens).toHaveLength(TOKEN_LENGTH)
    expect(tokens.reduce((a, b) => a + b, 0)).toBe(32)
    // White king on e1: square 4, plane 5.
    expect(tokens[4 * 12 + 5]).toBe(1)
    // Black king on e8: square 60, plane 11.
    expect(tokens[60 * 12 + 11]).toBe(1)
    expect(tokens[4 * 12 + 11]).toBe(0)
  })

  it('shows a black-to-move position to the model as white', () => {
    const { tokens } = encodePosition(AFTER_E4)
    // The side to move became White: its pawns are the white ones on rank 2,
    // and White's e4 pawn came back as a black pawn on e5.
    expect(tokens[squareIndex('e2') * 12 + 0]).toBe(1)
    expect(tokens[squareIndex('e5') * 12 + 6]).toBe(1)
    expect(tokens[squareIndex('e5') * 12 + 0]).toBe(0)
    expect(tokens[squareIndex('e4') * 12 + 0]).toBe(0)
  })

  it('gives every legal move back in the caller’s coordinates', () => {
    const { legal } = encodePosition(AFTER_E4)
    expect(legal).toHaveLength(new Chess(AFTER_E4).moves().length)
    const e7e5 = legal.find((m) => m.uci === 'e7e5')
    expect(e7e5).toBeDefined()
    // Its slot in the policy is the mirrored move's, because that is what the
    // model was asked about.
    expect(e7e5?.index).toBe(moveIndex('e2e4'))
  })

  it('encodes promotions', () => {
    const { legal } = encodePosition('8/P6k/8/8/8/8/8/K7 w - - 0 1')
    const queening = legal.find((m) => m.uci === 'a7a8q')
    expect(queening?.index).toBe(moveTable['a7a8q'])
    expect(legal.filter((m) => m.uci.startsWith('a7a8'))).toHaveLength(4)
  })
})

describe('decoding', () => {
  const legal = [
    { index: 10, uci: 'e2e4' },
    { index: 20, uci: 'd2d4' },
    { index: 30, uci: 'g1f3' },
  ]

  it('softmaxes over the legal moves, best first', () => {
    const logits = new Float32Array(POLICY_SIZE)
    logits[10] = 1
    logits[20] = 2
    logits[30] = 0
    const moves = decodePolicy(logits, legal)
    expect(moves.map((m) => m.uci)).toEqual(['d2d4', 'e2e4', 'g1f3'])
    expect(moves.reduce((a, m) => a + m.prob, 0)).toBeCloseTo(1, 10)
  })

  it('ignores the illegal moves entirely', () => {
    const logits = new Float32Array(POLICY_SIZE)
    // A move that is not in the position, shouting louder than any that is.
    logits[999] = 50
    const moves = decodePolicy(logits, legal)
    expect(moves).toHaveLength(3)
    expect(moves.reduce((a, m) => a + m.prob, 0)).toBeCloseTo(1, 10)
  })

  it('has no opinion about a position with no moves', () => {
    expect(decodePolicy(new Float32Array(POLICY_SIZE), [])).toEqual([])
  })

  it('reads the value head from white’s side', () => {
    // Loss, draw, win for the side to move.
    const winning = Float32Array.from([0, 0, 100])
    expect(decodeValue(winning, false)).toBeCloseTo(1, 6)
    expect(decodeValue(winning, true)).toBeCloseTo(0, 6)
    const drawn = Float32Array.from([0, 100, 0])
    expect(decodeValue(drawn, false)).toBeCloseTo(0.5, 6)
    expect(decodeValue(drawn, true)).toBeCloseTo(0.5, 6)
  })
})

describe('predictMoves', () => {
  /** Stands in for the worker: records what it was asked, answers a fixed policy. */
  function fakeRunner(favour: string) {
    const calls: { tokens: Float32Array; eloSelf: number; eloOppo: number }[] = []
    const runner: ModelRunner = {
      async run(tokens, eloSelf, eloOppo) {
        calls.push({ tokens, eloSelf, eloOppo })
        const policy = new Float32Array(POLICY_SIZE)
        policy[moveIndex(favour)] = 10
        return { policy, value: Float32Array.from([0, 1, 0]) }
      },
    }
    return { runner, calls }
  }

  it('asks with the position and the rating on both sides', async () => {
    const { runner, calls } = fakeRunner('e2e4')
    await predictMoves(runner, START, 1500)
    expect(calls).toHaveLength(1)
    expect(calls[0].tokens).toHaveLength(TOKEN_LENGTH)
    expect(calls[0].eloSelf).toBe(1500)
    expect(calls[0].eloOppo).toBe(1500)
  })

  it('answers in the caller’s coordinates, not the model’s', async () => {
    // The model is told about a white position and picks e2e4; on the real
    // board it is black to move and the move is e7e5.
    const { runner } = fakeRunner('e2e4')
    const { moves } = await predictMoves(runner, AFTER_E4, 1200)
    expect(moves[0].uci).toBe('e7e5')
    expect(moves[0].prob).toBeGreaterThan(0.9)
  })
})

describe('verdicts', () => {
  // The engine likes e4 and d4; Maia expects e4, h6 and Nh6, neither of which
  // the engine listed — the case the whole feature exists for.
  const primary = [
    { uci: 'e2e4', score: { cp: 30 } },
    { uci: 'd2d4', score: { cp: 25 } },
  ]
  const wanted = ['e2e4', 'h7h6', 'g8h6']

  it('searches only what the panel missed, plus the baseline', () => {
    expect(movesToSearch(wanted, primary)).toEqual(['e2e4', 'h7h6', 'g8h6'])
    expect(movesToSearch(['e2e4', 'd2d4'], primary)).toEqual([])
  })

  it('keeps the baseline out of the list when it is already in it', () => {
    const asked = movesToSearch(['e2e4', 'h7h6'], primary)
    expect(asked.filter((uci) => uci === 'e2e4')).toHaveLength(1)
  })

  it('takes the first move of each line', () => {
    expect(firstMoves([{ pvUci: ['e2e4', 'e7e5'], score: { cp: 30 } }, { pvUci: [], score: {} }])).toEqual(
      [{ uci: 'e2e4', score: { cp: 30 } }],
    )
  })

  it('measures each move against the best of its own search', () => {
    // The constrained search ran deeper on fewer moves and came back with a
    // different number for the same baseline move. h6 is judged against THAT
    // number, not against the panel's.
    const constrained = [
      { uci: 'e2e4', score: { cp: 80 } },
      { uci: 'h7h6', score: { cp: 70 } },
      { uci: 'g8h6', score: { cp: -400 } },
    ]
    const verdicts = verdictsForMoves(wanted, primary, constrained, true)
    // e4 is the engine's own choice, and it was scored by the panel's search.
    expect(verdicts.get('e2e4')).toBe('best')
    // 80 -> 70 is a small loss, not the large one it would be against cp 30.
    expect(verdicts.get('h7h6')).toBe('excellent')
    expect(verdicts.get('g8h6')).toBe('blunder')
  })

  it('leaves a move unjudged until something has scored it', () => {
    expect(verdictsForMoves(wanted, primary, [], true).has('h7h6')).toBe(false)
    expect(verdictsForMoves(wanted, [], [], true).size).toBe(0)
  })

  it('gives the colouring search a fraction of the panel’s time', () => {
    expect(colourSearchMs(10)).toBe(4000)
    expect(colourSearchMs(8)).toBe(3200)
    // Never so short that the round trip costs more than the search.
    expect(colourSearchMs(1)).toBe(500)
  })

  it('colours the same verdicts the move list marks', () => {
    expect(isColoured('best')).toBe(true)
    expect(isColoured('blunder')).toBe(true)
    expect(isColoured('mistake')).toBe(true)
    expect(isColoured('inaccuracy')).toBe(true)
    expect(isColoured('good')).toBe(false)
    expect(isColoured('excellent')).toBe(false)
  })
})

describe('rating selection', () => {
  it('offers 600 to 2600 in hundreds', () => {
    expect(MAIA_RATINGS[0]).toBe(600)
    expect(MAIA_RATINGS.at(-1)).toBe(2600)
    expect(MAIA_RATINGS).toHaveLength(21)
  })

  it('snaps an estimate to the nearest offered rating, and clamps', () => {
    expect(nearestRating(1449)).toBe(1400)
    expect(nearestRating(1450)).toBe(1500)
    // The played-like estimate runs 400-3000; Maia does not.
    expect(nearestRating(400)).toBe(600)
    expect(nearestRating(3000)).toBe(2600)
  })
})
