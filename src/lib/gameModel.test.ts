import { describe, expect, it } from 'vitest'
import type { Move } from './convert'
import {
  capturedMaterial,
  explorationFen,
  moveTargets,
  playExploredMove,
  replayGame,
  startExploration,
  takeBackExploredMove,
} from './gameModel'

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

describe('exploring a line by hand', () => {
  // After 1. e4 e5, with White to play move 2.
  const branch = () => startExploration(fenAfter(['e4', 'e5']), 2)

  it('records where it branched from and whose move it is', () => {
    const line = branch()
    expect(line.fromPly).toBe(2)
    expect(line.branchNumber).toBe(2)
    expect(line.branchColor).toBe('w')
    expect(line.sans).toEqual([])
    expect(line.lastMoveSquares).toBeNull()
  })

  it('plays a legal move and keeps the position it reaches', () => {
    const line = playExploredMove(branch(), 'g1', 'f3')
    expect(line?.sans).toEqual(['Nf3'])
    expect(line?.lastMoveSquares).toEqual(['g1', 'f3'])
    expect(explorationFen(line!)).toBe(fenAfter(['e4', 'e5', 'Nf3']))
  })

  it('refuses an illegal move, leaving the line alone', () => {
    expect(playExploredMove(branch(), 'g1', 'g4')).toBeNull()
    // A piece of the side not to move is just as illegal.
    expect(playExploredMove(branch(), 'e5', 'e4')).toBeNull()
  })

  it('promotes a pawn to a queen', () => {
    const line = startExploration('8/P7/8/4k3/8/8/8/4K3 w - - 0 1', 40)
    const promoted = playExploredMove(line, 'a7', 'a8')
    expect(promoted?.sans).toEqual(['a8=Q'])
  })

  it('takes back the last move, restoring the highlight to the one before', () => {
    const two = playExploredMove(playExploredMove(branch(), 'g1', 'f3')!, 'b8', 'c6')!
    const one = takeBackExploredMove(two)
    expect(one?.sans).toEqual(['Nf3'])
    expect(one?.lastMoveSquares).toEqual(['g1', 'f3'])
    expect(explorationFen(one!)).toBe(fenAfter(['e4', 'e5', 'Nf3']))
  })

  it('takes back to the branch position, with nothing highlighted', () => {
    const one = playExploredMove(branch(), 'g1', 'f3')!
    const none = takeBackExploredMove(one)
    expect(none?.sans).toEqual([])
    expect(none?.lastMoveSquares).toBeNull()
    expect(explorationFen(none!)).toBe(fenAfter(['e4', 'e5']))
  })

  it('has nothing left to take back at the branch', () => {
    expect(takeBackExploredMove(branch())).toBeNull()
  })
})
