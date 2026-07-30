import { describe, expect, it } from 'vitest'
import type { Move } from '../convert'
import { replayGame } from '../gameModel'
import {
  buildGameAnalysis,
  classify,
  CLASSIFICATION_SYMBOL,
  CLASSIFICATIONS,
  DECIDED_CP,
  findPhases,
  hasMoveMarker,
  moveAccuracy,
  phaseOfPly,
  pieceMaterial,
  playedLikeRating,
  PLAYED_LIKE_MAE,
  scoreCp,
  winPct,
} from './analysis'
import type { Classification } from './analysis'

describe('winPct', () => {
  it('is 50 for an equal position', () => {
    expect(winPct({ cp: 0 })).toBeCloseTo(50)
  })
  it('is symmetric around 50', () => {
    expect(winPct({ cp: 100 }) + winPct({ cp: -100 })).toBeCloseTo(100)
  })
  it('grows with advantage', () => {
    expect(winPct({ cp: 300 })).toBeGreaterThan(winPct({ cp: 100 }))
  })
  it('saturates at mate', () => {
    expect(winPct({ mate: 3 })).toBe(100)
    expect(winPct({ mate: -3 })).toBe(0)
  })
})

describe('scoreCp', () => {
  it('clamps mates and huge evals to ±1000', () => {
    expect(scoreCp({ mate: 5 })).toBe(1000)
    expect(scoreCp({ mate: -5 })).toBe(-1000)
    expect(scoreCp({ cp: 4200 })).toBe(1000)
    expect(scoreCp({ cp: -12 })).toBe(-12)
  })
})

describe('moveAccuracy', () => {
  it('is ~100 for a perfect move and decays with loss', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
    expect(moveAccuracy(10)).toBeLessThan(moveAccuracy(5))
    expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0)
  })
})

describe('classify', () => {
  it('labels the engine move best regardless of loss', () => {
    expect(classify(0, true)).toBe('best')
  })
  it('applies win-%-loss thresholds', () => {
    expect(classify(1, false)).toBe('excellent')
    expect(classify(4, false)).toBe('good')
    expect(classify(8, false)).toBe('inaccuracy')
    expect(classify(15, false)).toBe('mistake')
    expect(classify(30, false)).toBe('blunder')
  })
})

describe('hasMoveMarker', () => {
  const silent: Classification[] = ['good', 'excellent']

  it('stays silent for Good and Excellent and marks every other classification', () => {
    for (const c of silent) expect(hasMoveMarker(c)).toBe(false)
    for (const c of CLASSIFICATIONS.filter((x) => !silent.includes(x))) {
      expect(hasMoveMarker(c)).toBe(true)
    }
  })

  it('still gives the silent classes a symbol for the classification table', () => {
    // The table lists every class; only the move list and board suppress them.
    for (const c of silent) expect(CLASSIFICATION_SYMBOL[c]).toBeTruthy()
  })
})

describe('playedLikeRating', () => {
  it('decreases as average win-% loss grows', () => {
    expect(playedLikeRating(1)).toBeGreaterThan(playedLikeRating(5))
    expect(playedLikeRating(5)).toBeGreaterThan(playedLikeRating(20))
  })

  it('stays inside a plausible rating range at the extremes', () => {
    expect(playedLikeRating(0)).toBeLessThanOrEqual(3000)
    expect(playedLikeRating(0.001)).toBeLessThanOrEqual(3000)
    expect(playedLikeRating(100)).toBeGreaterThanOrEqual(400)
  })

  it('is rounded coarsely, reflecting the fit uncertainty', () => {
    for (const loss of [0.7, 2.3, 4.1, 8.8, 15]) {
      expect(playedLikeRating(loss) % 100).toBe(0)
    }
    // The rounding must not imply more precision than the fit actually has.
    expect(PLAYED_LIKE_MAE).toBeGreaterThan(100)
  })

  it('reproduces the calibrated anchor points', () => {
    // From scripts/fit-rating-curve.mjs over the 100-sample dataset.
    expect(playedLikeRating(2)).toBe(1900)
    expect(playedLikeRating(5)).toBe(1500)
    expect(playedLikeRating(12)).toBe(1100)
  })
})

describe('decided-position handling', () => {
  const moves: Move[] = [
    { number: 1, color: 'w', san: 'e4', emtSeconds: 0, anchorClockSeconds: null, clkSeconds: 0 },
    { number: 1, color: 'b', san: 'e5', emtSeconds: 0, anchorClockSeconds: null, clkSeconds: 0 },
  ]
  const { fens, ucis } = replayGame(moves)
  const noBest = [
    { uci: null, san: null },
    { uci: null, san: null },
  ]

  it('flags moves made from already-decided positions', () => {
    // White moves from a balanced position; Black from a lost one.
    const evals = [{ cp: 0 }, { cp: DECIDED_CP + 500 }, { cp: DECIDED_CP + 400 }]
    const analysis = buildGameAnalysis(fens, moves, evals, noBest, ucis)
    expect(analysis.moves[0].fromUndecided).toBe(true)
    expect(analysis.moves[1].fromUndecided).toBe(false)
  })

  it('falls back to all moves when too few undecided ones remain', () => {
    // Only two plies, so the undecided-only sample is below the minimum and
    // the summary must still produce a usable number.
    const evals = [{ cp: 900 }, { cp: 950 }, { cp: 1000 }]
    const analysis = buildGameAnalysis(fens, moves, evals, noBest, ucis)
    expect(Number.isFinite(analysis.white.awl)).toBe(true)
    expect(analysis.white.playedLike).toBeGreaterThanOrEqual(400)
  })
})

describe('pieceMaterial / phases', () => {
  it('counts non-pawn material from the start position', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(pieceMaterial(start)).toBe(62) // 2*(9+10+6+6)
  })
  it('detects a king-and-pawn endgame', () => {
    expect(pieceMaterial('8/4k3/8/8/8/8/4K3/4R3 w - - 0 1')).toBe(5)
  })
  it('splits phases by ply and material', () => {
    // 30 plies of full-material FENs, then low material from ply 25's pre-move position.
    const full = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const sparse = '8/4k3/8/8/8/8/4K3/4R3 w - - 0 1'
    const fens = [...Array(24).fill(full), ...Array(7).fill(sparse)] // 31 fens = 30 plies
    const phases = findPhases(fens)
    expect(phases.middlegameStartPly).toBe(21)
    expect(phases.endgameStartPly).toBe(25)
    expect(phaseOfPly(5, phases)).toBe('opening')
    expect(phaseOfPly(22, phases)).toBe('middlegame')
    expect(phaseOfPly(28, phases)).toBe('endgame')
  })
})

describe('buildGameAnalysis', () => {
  const moves: Move[] = [
    { number: 1, color: 'w', san: 'e4', emtSeconds: 0, anchorClockSeconds: null, clkSeconds: 0 },
    { number: 1, color: 'b', san: 'e5', emtSeconds: 0, anchorClockSeconds: null, clkSeconds: 0 },
  ]
  const { fens, ucis } = replayGame(moves)

  it('classifies and summarizes a two-ply game', () => {
    // White plays the engine best (no loss); Black gives up 25 win-% (blunder).
    const evals = [{ cp: 30 }, { cp: 30 }, { cp: 210 }]
    const bestMoves = [
      { uci: ucis[0], san: 'e4' },
      { uci: 'g8f6', san: 'Nf6' },
    ]
    const analysis = buildGameAnalysis(fens, moves, evals, bestMoves, ucis)

    expect(analysis.moves[0].classification).toBe('best')
    expect(analysis.moves[0].winPctLoss).toBe(0)
    expect(analysis.moves[1].color).toBe('b')
    expect(analysis.moves[1].winPctLoss).toBeGreaterThan(5)
    expect(analysis.moves[1].classification).not.toBe('best')
    expect(analysis.white.counts.best).toBe(1)
    expect(analysis.white.accuracy).toBeGreaterThan(analysis.black.accuracy)
    expect(analysis.white.playedLike).toBeGreaterThan(analysis.black.playedLike)
    // Two plies => all in the opening phase.
    expect(analysis.white.phaseAccuracy.middlegame).toBeNull()
    expect(analysis.middlegameStartPly).toBeNull()
  })

  it('keeps per-player counts summing to their move totals', () => {
    const evals = [{ cp: 0 }, { cp: -80 }, { cp: 120 }]
    const bestMoves = [
      { uci: null, san: null },
      { uci: null, san: null },
    ]
    const analysis = buildGameAnalysis(fens, moves, evals, bestMoves, ucis)
    const total = (c: typeof analysis.white) =>
      Object.values(c.counts).reduce((a, b) => a + b, 0)
    expect(total(analysis.white)).toBe(1)
    expect(total(analysis.black)).toBe(1)
  })
})
