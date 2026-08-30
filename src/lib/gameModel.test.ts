import { describe, expect, it } from 'vitest'
import type { Move } from './convert'
import {
  CLOCK_PLOT_INSET,
  capturedMaterial,
  carryPieceIdentities,
  checkedKingSquare,
  moveTargets,
  piecesOf,
  plyForClockClick,
  replayGame,
} from './gameModel'
import type { ChartRow } from './gameModel'

function movesFrom(sans: string[]): Move[] {
  return sans.map((san, i) => ({
    number: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san,
    emtSeconds: null,
    anchorClockSeconds: null,
    clkSeconds: null,
  }))
}

/** FEN after the given SAN moves from the initial position. */
function fenAfter(sans: string[]): string {
  const { fens } = replayGame(movesFrom(sans))
  return fens[fens.length - 1]
}

describe('capturedMaterial', () => {
  it('finds nothing captured in the starting position', () => {
    const captured = capturedMaterial(fenAfter([]))
    expect(captured.white).toEqual([])
    expect(captured.black).toEqual([])
    expect(captured.diff).toBe(0)
  })

  it('lists a captured pawn on the losing side and gives White the lead', () => {
    const captured = capturedMaterial(fenAfter(['e4', 'd5', 'exd5']))
    expect(captured.black).toEqual(['p'])
    expect(captured.white).toEqual([])
    expect(captured.diff).toBe(1)
  })

  it('shows nothing for a trade both sides made in kind', () => {
    // A pawn apiece: nothing to show, and no lead.
    const captured = capturedMaterial(fenAfter(['e4', 'd5', 'exd5', 'Qxd5']))
    expect(captured.white).toEqual([])
    expect(captured.black).toEqual([])
    expect(captured.diff).toBe(0)
  })

  it('shows only the surplus when both sides have lost the same kind', () => {
    // Black is down three pawns, White two: one pawn to show, not five.
    const captured = capturedMaterial('rnbqkbnr/ppppp3/8/8/8/8/PPPPPP2/RNBQKBNR w KQkq - 0 1')
    expect(captured.black).toEqual(['p'])
    expect(captured.white).toEqual([])
    expect(captured.diff).toBe(1)
  })

  it('orders a mixed haul pawns-first', () => {
    // Black is a knight and a rook down for a pawn.
    const captured = capturedMaterial('1nbqkb1r/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR w KQk - 0 1')
    expect(captured.white).toEqual(['p'])
    expect(captured.black).toEqual(['n', 'r'])
    expect(captured.diff).toBe(7)
  })

  it('measures the lead from the pieces on the board, so promotions count', () => {
    // White's a-pawn took on a8 and promoted: the pawn is listed as missing,
    // but the lead reads +13 (two queens against one) rather than the +4 the
    // captured lists alone would suggest.
    const captured = capturedMaterial('Qnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR b KQk - 0 1')
    expect(captured.white).toEqual(['p'])
    expect(captured.black).toEqual(['r'])
    expect(captured.diff).toBe(13)
  })
})

describe('moveTargets', () => {
  /** The squares reachable from `square`, sorted so order cannot fail a test. */
  const squares = (fen: string, square: string) =>
    moveTargets(fen, square)
      .map((target) => target.to)
      .sort()

  it('gives a piece its moves', () => {
    expect(squares(fenAfter([]), 'g1')).toEqual(['f3', 'h3'])
  })

  it('marks which targets take a piece', () => {
    // 1. e4 d5: the pawn may push to e5 or take on d5.
    const targets = moveTargets(fenAfter(['e4', 'd5']), 'e4')
    expect(targets).toContainEqual({ to: 'e5', capture: false })
    expect(targets).toContainEqual({ to: 'd5', capture: true })
  })

  it('marks en passant as a capture, though the square is empty', () => {
    const fen = fenAfter(['e4', 'a6', 'e5', 'd5'])
    expect(moveTargets(fen, 'e5')).toContainEqual({ to: 'd6', capture: true })
  })

  it('offers a promotion square once, not once per piece', () => {
    expect(squares('8/P7/8/4k3/8/8/8/4K3 w - - 0 1', 'a7')).toEqual(['a8'])
  })

  it("names castling by the king's square, which is how it is played", () => {
    const fen = fenAfter(['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Bc5'])
    expect(squares(fen, 'e1')).toEqual(['e2', 'f1', 'g1'])
  })

  it('has nothing for an empty square, the wrong side, or a pinned piece', () => {
    expect(moveTargets(fenAfter([]), 'e4')).toEqual([])
    expect(moveTargets(fenAfter([]), 'e7')).toEqual([])
    // The knight cannot leave the king in check from the bishop on b4.
    expect(moveTargets('4k3/8/8/8/1b6/2N5/8/4K3 w - - 0 1', 'c3')).toEqual([])
  })

  it('survives a square or a position it cannot read', () => {
    expect(moveTargets(fenAfter([]), 'z9')).toEqual([])
    expect(moveTargets('not a fen', 'e2')).toEqual([])
  })
})

describe('checkedKingSquare', () => {
  it('finds the king of the side that is in check', () => {
    // Scholar's mate: black's king on e8 is mated by the queen on f7.
    expect(
      checkedKingSquare('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'),
    ).toBe('e8')
    // A check that is not mate is still a check.
    expect(checkedKingSquare('4k3/8/8/8/8/8/8/R3K3 b - - 0 1')).toBe(null)
    expect(checkedKingSquare('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1')).toBe('e8')
  })

  it('says nothing when no one is in check', () => {
    expect(checkedKingSquare(fenAfter([]))).toBe(null)
    // Stalemate is not check, which is the whole difference between the two.
    expect(checkedKingSquare('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe(null)
  })

  it('survives a position it cannot read', () => {
    expect(checkedKingSquare('not a fen')).toBe(null)
  })
})

describe('carryPieceIdentities', () => {
  /** Ids by square, for asserting who kept theirs and who is new. */
  function idsBySquare(pieces: ReturnType<typeof carryPieceIdentities>) {
    return Object.fromEntries(pieces.map((p) => [p.square, p.id]))
  }

  const startingPieces = () => carryPieceIdentities([], fenAfter([]))

  it('numbers every piece in a position', () => {
    expect(piecesOf(fenAfter([])).length).toBe(32)
    expect(new Set(startingPieces().map((p) => p.id)).size).toBe(32)
  })

  it('keeps the id of a piece that moved, so it can be drawn moving', () => {
    const before = startingPieces()
    const pawn = idsBySquare(before)['e2']
    const after = carryPieceIdentities(before, fenAfter(['e4']), { from: 'e2', to: 'e4' })
    expect(idsBySquare(after)['e4']).toBe(pawn)
    expect(after).toHaveLength(32)
  })

  it('drops the piece that was taken and keeps the taker', () => {
    const before = carryPieceIdentities([], fenAfter(['e4', 'd5']))
    const pawn = idsBySquare(before)['e4']
    const after = carryPieceIdentities(before, fenAfter(['e4', 'd5', 'exd5']), {
      from: 'e4',
      to: 'd5',
    })
    expect(after).toHaveLength(31)
    expect(idsBySquare(after)['d5']).toBe(pawn)
  })

  // The move names the king's two squares and says nothing about the rook, so
  // a rook that keeps its id is the whole point of the second matching pass.
  it('moves the rook as well as the king when castling', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']
    const before = carryPieceIdentities([], fenAfter(sans))
    const ids = idsBySquare(before)
    const after = carryPieceIdentities(before, fenAfter([...sans, 'O-O']), { from: 'e1', to: 'g1' })
    expect(idsBySquare(after)['g1']).toBe(ids['e1'])
    expect(idsBySquare(after)['f1']).toBe(ids['h1'])
  })

  // The captured pawn is on neither of the squares the move names.
  it('removes the pawn taken en passant', () => {
    const sans = ['e4', 'a6', 'e5', 'd5']
    const before = carryPieceIdentities([], fenAfter(sans))
    const ids = idsBySquare(before)
    const after = carryPieceIdentities(before, fenAfter([...sans, 'exd6']), {
      from: 'e5',
      to: 'd6',
    })
    expect(after).toHaveLength(31)
    expect(idsBySquare(after)['d6']).toBe(ids['e5'])
    expect(idsBySquare(after)['d5']).toBeUndefined()
  })

  it('gives a promoted pawn a new identity rather than sliding a queen in', () => {
    const before = carryPieceIdentities([], '4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    const pawn = idsBySquare(before)['a7']
    const after = carryPieceIdentities(before, 'Q3k3/8/8/8/8/8/8/4K3 b - - 0 1', {
      from: 'a7',
      to: 'a8',
    })
    expect(idsBySquare(after)['a8']).not.toBe(pawn)
  })

  it('starts from nothing when the position is unrelated', () => {
    const before = startingPieces()
    const after = carryPieceIdentities(before, '4k3/8/8/8/8/8/8/4K3 w - - 0 1')
    expect(after).toHaveLength(2)
    // Both kings stand where they started, so both keep their ids.
    expect(idsBySquare(after)['e1']).toBe(idsBySquare(before)['e1'])
  })
})

describe('which move a click on the clock chart picked', () => {
  const rows: ChartRow[] = [1, 2, 3, 4].map((moveNumber) => ({
    moveNumber,
    whiteSan: 'x',
    blackSan: 'y',
    whiteClk: null,
    blackClk: null,
    whiteSpent: null,
    blackSpent: null,
    whitePly: moveNumber * 2 - 1,
    blackPly: moveNumber * 2,
  }))

  /** A plot 400px wide inside a container starting at x = 20. */
  const plot = { left: 20, right: 20 + CLOCK_PLOT_INSET.left + 400 + CLOCK_PLOT_INSET.right }
  const xFor = (fraction: number) => plot.left + CLOCK_PLOT_INSET.left + fraction * 400

  it('reads White from the left of a band and Black from the right', () => {
    // Move 1 owns the first quarter of a four-move plot, and its two plies
    // split that band down the middle — White's bar left, Black's right.
    expect(plyForClockClick(rows, plot, xFor(0.0625))).toBe(1)
    expect(plyForClockClick(rows, plot, xFor(0.1875))).toBe(2)
    expect(plyForClockClick(rows, plot, xFor(0.8125))).toBe(7)
    expect(plyForClockClick(rows, plot, xFor(0.9375))).toBe(8)
  })

  it('ignores a click outside the plot', () => {
    expect(plyForClockClick(rows, plot, plot.left)).toBeNull()
    expect(plyForClockClick(rows, plot, plot.right)).toBeNull()
  })

  it('falls back to the side the row does have', () => {
    // A game ending on White's move leaves the last band with no Black ply,
    // and a click on that half should still go somewhere sensible.
    const last: ChartRow[] = [{ ...rows[0], blackSan: null, blackPly: null }]
    const onePlot = { left: 0, right: CLOCK_PLOT_INSET.left + 100 + CLOCK_PLOT_INSET.right }
    expect(plyForClockClick(last, onePlot, CLOCK_PLOT_INSET.left + 80)).toBe(1)
  })
})
