import type { LegalMove } from './encode'

/**
 * Reading Maia-3's two heads.
 *
 * Maia is a pure policy model: one forward pass gives a distribution over the
 * legal moves and there is no search behind it. Adding one would make it a
 * worse predictor of human play, which is the only thing it is for.
 */

/** A move Maia might play, and how often it thinks a player of that rating would. */
export interface MaiaMove {
  uci: string
  /** 0-1, over the legal moves only. */
  prob: number
}

/**
 * Softmax the policy over the legal moves, best first.
 *
 * The illegal logits are not zeroed but dropped: they are part of the same
 * 4352-wide output and would otherwise take probability mass away from moves
 * that can actually be played.
 */
export function decodePolicy(logits: Float32Array, legal: LegalMove[]): MaiaMove[] {
  if (legal.length === 0) return []
  let max = -Infinity
  for (const move of legal) {
    const logit = logits[move.index]
    if (logit > max) max = logit
  }
  let total = 0
  const weights = legal.map((move) => {
    const weight = Math.exp(logits[move.index] - max)
    total += weight
    return weight
  })
  return legal
    .map((move, i) => ({ uci: move.uci, prob: weights[i] / total }))
    .sort((a, b) => b.prob - a.prob)
}

/**
 * The value head's loss/draw/win logits as a win probability for WHITE, which
 * is the perspective every score in this app is in. The head speaks for the
 * side to move, so a Black-to-move position is the complement.
 *
 * Nothing in the review uses this — Stockfish owns evaluation here, and Maia's
 * value head is a much weaker one. It is decoded because the model returns it,
 * and it is worth having for a sanity check.
 */
export function decodeValue(logits: Float32Array, blackToMove: boolean): number {
  const max = Math.max(logits[0], logits[1], logits[2])
  const loss = Math.exp(logits[0] - max)
  const draw = Math.exp(logits[1] - max)
  const win = Math.exp(logits[2] - max)
  const forMover = (win + 0.5 * draw) / (loss + draw + win)
  return blackToMove ? 1 - forMover : forMover
}
