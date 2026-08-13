import { Chess } from 'chess.js'
import { moveIndex } from './moves'

/**
 * Turning a position into what Maia-3 eats.
 *
 * Maia-3 only ever sees White to move: a Black-to-move position is mirrored —
 * flipped top to bottom and recoloured — and the moves it answers with are
 * mirrored back. That is upstream's contract, not a simplification of ours, and
 * the whole reason this file exists rather than a call to chess.js.
 *
 * The model's only board input is 64 squares × 12 piece planes. Castling
 * rights, the en-passant square and the side to move are not fed to it at all;
 * the mirroring still keeps them right in the FEN because the legal moves are
 * generated from it.
 */

/** A legal move: where it sits in the policy, and its UCI on the real board. */
export interface LegalMove {
  index: number
  uci: string
}

export interface EncodedPosition {
  /** (64, 12) flattened, square-major. */
  tokens: Float32Array
  legal: LegalMove[]
}

/** White P,N,B,R,Q,K then black p,n,b,r,q,k — the order the planes are in. */
const PIECES = 'PNBRQKpnbrqk'

export const TOKEN_LENGTH = 64 * 12

function mirrorSquare(square: string): string {
  return square[0] + String(9 - Number(square[1]))
}

/** Flip a UCI move top to bottom. Its own inverse. */
export function mirrorMove(uci: string): string {
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4)
}

function swapCase(rank: string): string {
  let out = ''
  for (const ch of rank) {
    out += ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch.toUpperCase()
  }
  return out
}

function swapCastling(castling: string): string {
  if (castling === '-') return '-'
  const swapped = new Set([...castling].map((c) => swapCase(c)))
  // Canonical order, which is not the order the swap produces.
  const out = ['K', 'Q', 'k', 'q'].filter((c) => swapped.has(c)).join('')
  return out || '-'
}

/**
 * Flip a FEN top to bottom and swap the colours, so that whoever was to move is
 * now White to move. The move counters are left alone: nothing reads them here.
 */
export function mirrorFen(fen: string): string {
  const [position, active, castling, ep, half = '0', full = '1'] = fen.split(' ')
  const ranks = position.split('/').reverse().map(swapCase).join('/')
  return [
    ranks,
    active === 'w' ? 'b' : 'w',
    swapCastling(castling),
    ep === '-' ? '-' : mirrorSquare(ep),
    half,
    full,
  ].join(' ')
}

/** One-hot piece planes for a White-to-move FEN. */
function boardTokens(fen: string): Float32Array {
  const tokens = new Float32Array(TOKEN_LENGTH)
  const ranks = fen.split(' ')[0].split('/')
  for (const [row, rank] of ranks.entries()) {
    // FEN starts at rank 8, and square 0 is a1.
    const base = (7 - row) * 8
    let file = 0
    for (const ch of rank) {
      const empty = Number(ch)
      if (empty) {
        file += empty
        continue
      }
      const piece = PIECES.indexOf(ch)
      if (piece >= 0) tokens[(base + file) * 12 + piece] = 1
      file += 1
    }
  }
  return tokens
}

/**
 * Encode a position for inference. The returned moves carry their UCI as the
 * caller's board would write it, mirrored back already, so that nothing
 * downstream has to remember whose turn it was.
 */
export function encodePosition(fen: string): EncodedPosition {
  const flipped = fen.split(' ')[1] === 'b'
  const forModel = flipped ? mirrorFen(fen) : fen
  const board = new Chess(forModel)

  const legal: LegalMove[] = []
  for (const move of board.moves({ verbose: true })) {
    const uci = move.from + move.to + (move.promotion ?? '')
    const index = moveIndex(uci)
    if (index < 0) continue
    legal.push({ index, uci: flipped ? mirrorMove(uci) : uci })
  }

  return { tokens: boardTokens(forModel), legal }
}
