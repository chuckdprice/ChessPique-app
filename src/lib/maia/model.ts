import { encodePosition } from './encode'
import { decodePolicy, decodeValue } from './decode'
import type { MaiaMove } from './decode'

/**
 * What one Maia-3 forward pass is, with the ONNX runtime held at arm's length.
 *
 * Everything above this line is arithmetic on a FEN and can be tested without a
 * model; everything below it is `onnxruntime-web` in a worker. The seam is here
 * because the encoding and the policy decode are the parts that go quietly
 * wrong, and a bug in them should not need a 43 MB download to catch.
 */
export interface ModelRunner {
  run(
    tokens: Float32Array,
    eloSelf: number,
    eloOppo: number,
  ): Promise<{ policy: Float32Array; value: Float32Array }>
}

/**
 * The ratings Maia-3 is offered at, matching Maia's own site. The model itself
 * takes a raw number and interpolates — these are buckets in the dropdown, not
 * in the network, and the older nine-model 1100-1900 lineup has nothing to do
 * with this one.
 */
export const MAIA_RATING_MIN = 600
export const MAIA_RATING_MAX = 2600
export const MAIA_RATING_STEP = 100

export const MAIA_RATINGS: number[] = Array.from(
  { length: (MAIA_RATING_MAX - MAIA_RATING_MIN) / MAIA_RATING_STEP + 1 },
  (_, i) => MAIA_RATING_MIN + i * MAIA_RATING_STEP,
)

/** The offered rating closest to an estimate, for picking the default. */
export function nearestRating(elo: number): number {
  const snapped = Math.round(elo / MAIA_RATING_STEP) * MAIA_RATING_STEP
  return Math.max(MAIA_RATING_MIN, Math.min(MAIA_RATING_MAX, snapped))
}

export interface MaiaPrediction {
  /** Legal moves by how likely a human of that rating is to play them, best first. */
  moves: MaiaMove[]
  /** Maia's own win probability for White, 0-1. Not used for classification. */
  winProb: number
}

/**
 * Ask Maia what a player of `rating` would play here.
 *
 * Both sides are given the same rating. Maia conditions on the opponent's
 * strength as well as the player's, but the panel offers one number — Maia's
 * own analysis board does exactly this, and two dropdowns would be a lot of
 * chrome for a second-order effect.
 */
export async function predictMoves(
  runner: ModelRunner,
  fen: string,
  rating: number,
): Promise<MaiaPrediction> {
  const { tokens, legal } = encodePosition(fen)
  const { policy, value } = await runner.run(tokens, rating, rating)
  return {
    moves: decodePolicy(policy, legal),
    winProb: decodeValue(value, fen.split(' ')[1] === 'b'),
  }
}
