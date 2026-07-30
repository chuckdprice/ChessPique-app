import { Chess } from 'chess.js'
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

/**
 * A side's remaining clock at the given ply: the clock after their most recent
 * move at or before `ply`, or the starting time before they have moved.
 */
export function clockAtPly(
  moves: Move[],
  ply: number,
  color: 'w' | 'b',
  startSeconds: number,
): number {
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
  /** Missing white pieces (captured by Black), pawns first. */
  white: CapturedKind[]
  /** Missing black pieces (captured by White), pawns first. */
  black: CapturedKind[]
  /** Material difference in pawns from what is on the board; > 0 = White ahead. */
  diff: number
}

/**
 * What each side has lost, and by how much material one side leads.
 *
 * The captured lists come from what is missing against the starting army, so a
 * promotion can hide a lost pawn (the count is clamped at zero). The difference
 * is measured from the pieces actually on the board instead, which stays right
 * through promotions.
 */
export function capturedMaterial(fen: string): CapturedMaterial {
  const board = fen.split(' ')[0]
  const present: Record<string, number> = {}
  for (const ch of board) {
    if (/[pnbrqPNBRQ]/.test(ch)) present[ch] = (present[ch] ?? 0) + 1
  }

  const missing = (kind: CapturedKind, color: 'w' | 'b'): CapturedKind[] => {
    const ch = color === 'w' ? kind.toUpperCase() : kind
    const gone = Math.max(0, START_COUNT[kind] - (present[ch] ?? 0))
    return Array<CapturedKind>(gone).fill(kind)
  }
  const material = (color: 'w' | 'b') =>
    CAPTURED_ORDER.reduce((total, kind) => {
      const ch = color === 'w' ? kind.toUpperCase() : kind
      return total + (present[ch] ?? 0) * PIECE_VALUE[kind]
    }, 0)

  return {
    white: CAPTURED_ORDER.flatMap((kind) => missing(kind, 'w')),
    black: CAPTURED_ORDER.flatMap((kind) => missing(kind, 'b')),
    diff: material('w') - material('b'),
  }
}

export interface ChartRow {
  moveNumber: number
  whiteSan: string | null
  blackSan: string | null
  whiteClk: number | null
  blackClk: number | null
  whiteEmt: number | null
  blackEmt: number | null
}

/** Group per-ply timing data into one row per integer move number. */
export function buildChartRows(moves: Move[]): ChartRow[] {
  const byNumber = new Map<number, ChartRow>()
  for (const move of moves) {
    let row = byNumber.get(move.number)
    if (!row) {
      row = {
        moveNumber: move.number,
        whiteSan: null,
        blackSan: null,
        whiteClk: null,
        blackClk: null,
        whiteEmt: null,
        blackEmt: null,
      }
      byNumber.set(move.number, row)
    }
    if (move.color === 'w') {
      row.whiteSan = move.san
      row.whiteClk = move.clkSeconds
      row.whiteEmt = move.emtSeconds
    } else {
      row.blackSan = move.san
      row.blackClk = move.clkSeconds
      row.blackEmt = move.emtSeconds
    }
  }
  return [...byNumber.values()].sort((a, b) => a.moveNumber - b.moveNumber)
}
