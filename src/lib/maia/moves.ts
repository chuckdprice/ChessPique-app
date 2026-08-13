/**
 * Maia-3's 4352-move policy space.
 *
 * The layout is nowhere documented. It was read off the table Maia's own
 * frontend ships (`all_moves_maia3.json`) and checked to hold for every one of
 * the 4352 entries — which is what the test does, against a vendored copy of
 * that table. Deriving the mapping rather than shipping the 130 kB of JSON
 * keeps the model's vocabulary out of the bundle; the fixture keeps the
 * derivation honest, and will fail loudly if a later model renumbers it.
 *
 *   0…4095   from * 64 + to, where a square is file + rank * 8 (a1 = 0)
 *   4096…    promotions, 4096 + (fromFile * 8 + toFile) * 4 + piece
 *
 * Promotions carry no rank because they never need one: a position is mirrored
 * so that the side to move is always White, so a promotion is always 7 → 8.
 */

export const POLICY_SIZE = 4352

const FILES = 'abcdefgh'
const PROMO_PIECES = ['q', 'r', 'b', 'n']

/** 0-63 for "a1".."h8", or -1 for anything that is not a square. */
export function squareIndex(square: string): number {
  const file = FILES.indexOf(square[0])
  const rank = square.charCodeAt(1) - 49 // '1'
  if (file < 0 || rank < 0 || rank > 7) return -1
  return rank * 8 + file
}

export function squareName(index: number): string {
  return FILES[index % 8] + String(Math.floor(index / 8) + 1)
}

/**
 * The policy index for a UCI move, or -1 if it falls outside the space.
 *
 * Underpromotions to a piece Maia does not model, and promotions on a rank
 * other than 7→8, are the only real ways to miss — both impossible once the
 * position is mirrored, but the caller gets -1 rather than a wrong index.
 */
export function moveIndex(uci: string): number {
  const from = squareIndex(uci.slice(0, 2))
  const to = squareIndex(uci.slice(2, 4))
  if (from < 0 || to < 0) return -1
  if (uci.length === 4) return from * 64 + to
  const piece = PROMO_PIECES.indexOf(uci[4])
  if (piece < 0 || Math.floor(from / 8) !== 6 || Math.floor(to / 8) !== 7) return -1
  return 4096 + ((from % 8) * 8 + (to % 8)) * 4 + piece
}

/** The UCI move a policy index stands for. Inverse of `moveIndex`. */
export function uciFromIndex(index: number): string {
  if (index < 4096) {
    return squareName(Math.floor(index / 64)) + squareName(index % 64)
  }
  const rest = index - 4096
  const piece = PROMO_PIECES[rest % 4]
  const files = Math.floor(rest / 4)
  return `${FILES[Math.floor(files / 8)]}7${FILES[files % 8]}8${piece}`
}
