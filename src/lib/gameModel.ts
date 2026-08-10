import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { Move } from './convert'

export interface ReplayedGame {
  /** fens[0] is the starting position; fens[i] is the position after ply i. */
  fens: string[]
  /** lastMoveSquares[i] = [from, to] of ply i (1-indexed like fens). */
  lastMoveSquares: Array<[string, string] | null>
  /** ucis[i] is the UCI string of moves[i] (0-indexed like the moves array). */
  ucis: string[]
}

export class ReplayError extends Error {}

/** Replay SAN moves and return the FEN after every ply. */
export function replayGame(moves: Move[]): ReplayedGame {
  const chess = new Chess()
  const fens: string[] = [chess.fen()]
  const lastMoveSquares: Array<[string, string] | null> = [null]
  const ucis: string[] = []

  for (const move of moves) {
    try {
      const played = chess.move(move.san)
      fens.push(chess.fen())
      lastMoveSquares.push([played.from, played.to])
      ucis.push(`${played.from}${played.to}${played.promotion ?? ''}`)
    } catch {
      throw new ReplayError(
        `Illegal or unrecognized move: ${move.number}${move.color === 'w' ? '.' : '...'} ${move.san}`,
      )
    }
  }

  return { fens, lastMoveSquares, ucis }
}

/** Somewhere the piece on a chosen square may go, for the board's markers. */
export interface MoveTarget {
  to: string
  /** True when landing there takes a piece. */
  capture: boolean
}

/**
 * Where the piece on `square` may legally go, empty for an empty square, for
 * one holding a piece of the side not to move, and for a piece with no moves.
 *
 * `capture` is read from the move rather than from what stands on the target,
 * so en passant — which lands on an empty square — is still marked as one.
 * Promotions collapse to one target: they are four moves to the same square.
 */
export function moveTargets(fen: string, square: string): MoveTarget[] {
  let moves
  try {
    // Squares arrive from the board as plain strings; chess.js answers an
    // unrecognised one with no moves, which is the answer this wants anyway.
    moves = new Chess(fen).moves({ square: square as Square, verbose: true })
  } catch {
    return []
  }
  const byTo = new Map<string, MoveTarget>()
  for (const move of moves) {
    byTo.set(move.to, { to: move.to, capture: move.captured != null })
  }
  return [...byTo.values()]
}

/**
 * A side's remaining clock at the given ply: the clock after their most recent
 * move at or before `ply`, or the starting time before they have moved.
 */
export function clockAtPly(
  moves: Move[],
  ply: number,
  color: 'w' | 'b',
  startSeconds: number | null,
): number | null {
  for (let i = Math.min(ply, moves.length) - 1; i >= 0; i--) {
    if (moves[i].color === color) return moves[i].clkSeconds ?? startSeconds
  }
  return startSeconds
}

/** Piece kinds a side can lose, ordered as they stack outward from the centre. */
export type CapturedKind = 'p' | 'n' | 'b' | 'r' | 'q'

const CAPTURED_ORDER: CapturedKind[] = ['p', 'n', 'b', 'r', 'q']
const START_COUNT: Record<CapturedKind, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const PIECE_VALUE: Record<CapturedKind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

export interface CapturedMaterial {
  /** White pieces missing over and above Black's own losses, pawns first. */
  white: CapturedKind[]
  /** Black pieces missing over and above White's own losses, pawns first. */
  black: CapturedKind[]
  /** Material difference in pawns from what is on the board; > 0 = White ahead. */
  diff: number
}

/**
 * What each side is *up* in each kind of piece, and by how much material one
 * side leads overall.
 *
 * Only the imbalance is listed: a piece each side has lost in equal number is
 * cancelled out, so four pawns apiece show nothing and five against four show
 * one pawn. Every capture drawn would be twenty-odd pieces down a strip a board
 * square wide by the endgame, too crowded to tell a rook from a bishop and
 * saying nothing an even trade needed saying.
 *
 * Counts come from what is missing against the starting army, so a promotion
 * can hide a lost pawn (each count is clamped at zero). The difference is
 * measured from the pieces actually on the board instead, which stays right
 * through promotions.
 */
export function capturedMaterial(fen: string): CapturedMaterial {
  const board = fen.split(' ')[0]
  const present: Record<string, number> = {}
  for (const ch of board) {
    if (/[pnbrqPNBRQ]/.test(ch)) present[ch] = (present[ch] ?? 0) + 1
  }

  const missing = (kind: CapturedKind, color: 'w' | 'b'): number => {
    const ch = color === 'w' ? kind.toUpperCase() : kind
    return Math.max(0, START_COUNT[kind] - (present[ch] ?? 0))
  }
  const surplus = (kind: CapturedKind, color: 'w' | 'b'): CapturedKind[] => {
    const net = missing(kind, color) - missing(kind, color === 'w' ? 'b' : 'w')
    return Array<CapturedKind>(Math.max(0, net)).fill(kind)
  }
  const material = (color: 'w' | 'b') =>
    CAPTURED_ORDER.reduce((total, kind) => {
      const ch = color === 'w' ? kind.toUpperCase() : kind
      return total + (present[ch] ?? 0) * PIECE_VALUE[kind]
    }, 0)

  return {
    white: CAPTURED_ORDER.flatMap((kind) => surplus(kind, 'w')),
    black: CAPTURED_ORDER.flatMap((kind) => surplus(kind, 'b')),
    diff: material('w') - material('b'),
  }
}

export interface ChartRow {
  moveNumber: number
  whiteSan: string | null
  blackSan: string | null
  whiteClk: number | null
  blackClk: number | null
  /** Time spent on the move — from %emt, or reconstructed from the clock. */
  whiteSpent: number | null
  blackSpent: number | null
  /**
   * Ply each half of the row stands for, so a click on the chart can jump the
   * board there. Carried rather than derived: 2n-1 only holds for a game that
   * starts at move 1 with White to play.
   */
  whitePly: number | null
  blackPly: number | null
}

/** Group per-ply timing data into one row per integer move number. */
export function buildChartRows(moves: Move[]): ChartRow[] {
  const byNumber = new Map<number, ChartRow>()
  moves.forEach((move, i) => {
    let row = byNumber.get(move.number)
    if (!row) {
      row = {
        moveNumber: move.number,
        whiteSan: null,
        blackSan: null,
        whiteClk: null,
        blackClk: null,
        whiteSpent: null,
        blackSpent: null,
        whitePly: null,
        blackPly: null,
      }
      byNumber.set(move.number, row)
    }
    if (move.color === 'w') {
      row.whiteSan = move.san
      row.whiteClk = move.clkSeconds
      row.whiteSpent = move.spentSeconds
      row.whitePly = i + 1
    } else {
      row.blackSan = move.san
      row.blackClk = move.clkSeconds
      row.blackSpent = move.spentSeconds
      row.blackPly = i + 1
    }
  })
  return [...byNumber.values()].sort((a, b) => a.moveNumber - b.moveNumber)
}
