import { classifyCandidate } from '../engine/analysis'
import type { Classification } from '../engine/analysis'
import type { Score } from '../engine/uci'

/**
 * What Stockfish makes of the moves Maia expects.
 *
 * The hard part is that Maia's moves are mostly not the engine's: a move 45% of
 * players would pick and the engine will not list is the whole point of showing
 * the two side by side. So the moves come from up to two searches — the panel's
 * own MultiPV, and a `searchmoves` search covering whatever it missed — and a
 * move is only ever compared against the best move from the SAME search. Scores
 * from two searches are at two depths, and comparing across them is how a
 * variation once quietly borrowed the mainline's verdict.
 */

export interface ScoredMove {
  uci: string
  score: Score
}

/** The first move of each engine line, best first. */
export function firstMoves(lines: { pvUci: string[]; score: Score }[]): ScoredMove[] {
  return lines
    .filter((line) => line.pvUci.length > 0)
    .map((line) => ({ uci: line.pvUci[0], score: line.score }))
}

/**
 * How long the colouring search gets, as a fraction of the panel's own.
 *
 * It is not doing the same job. The panel's search is looking for the best
 * move; this one is scoring two or three named moves against a baseline drawn
 * from *the same search*, so it only has to be internally consistent to be
 * right — its depth never has to match the panel's, because nothing ever
 * compares across the two. Giving it the full movetime doubled the wait for a
 * colour and bought precision the classification bands cannot spend: they are
 * 2, 5, 10 and 20 percentage points of win probability wide, and the last few
 * ply of a search on three forced candidates rarely move a move across one.
 */
export const COLOUR_SEARCH_FRACTION = 0.4
/** Below this the search is too short to be worth the round trip. */
const COLOUR_SEARCH_MIN_MS = 500

export function colourSearchMs(searchTimeSec: number): number {
  const share = Math.round(searchTimeSec * 1000 * COLOUR_SEARCH_FRACTION)
  return Math.max(COLOUR_SEARCH_MIN_MS, share)
}

/**
 * Which of `wanted` still need scoring, given what the panel's search already
 * covered. The engine's own best move is always included: it is the baseline
 * the others are measured against, and it has to come out of the same search
 * as they do.
 */
export function movesToSearch(wanted: string[], covered: ScoredMove[]): string[] {
  const known = new Set(covered.map((move) => move.uci))
  const missing = wanted.filter((uci) => !known.has(uci))
  if (missing.length === 0) return []
  const best = covered[0]?.uci
  return best && !missing.includes(best) ? [best, ...missing] : missing
}

/** What the engine makes of one of Maia's moves: its score, and the grade. */
export interface Verdict {
  classification: Classification
  /**
   * White-POV, and from whichever search scored this move — so a move only the
   * constrained search covered carries that search's number, which is shallower
   * than the panel's and may differ from the same move's eval in the lines
   * opposite. That is the same rule the classification follows, and the
   * alternative is showing a number the grade beside it was not derived from.
   */
  score: Score
}

/**
 * A verdict per move, or no entry for one nothing has scored yet.
 *
 * `isBest` is decided by the panel's own search, not by whichever search a move
 * happened to be scored in — the green "best" belongs to the engine's actual
 * first choice.
 */
export function verdictsForMoves(
  wanted: string[],
  primary: ScoredMove[],
  constrained: ScoredMove[],
  whiteToMove: boolean,
): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>()
  const bestUci = primary[0]?.uci
  for (const group of [primary, constrained]) {
    const best = group[0]
    if (!best) continue
    for (const move of group) {
      if (!wanted.includes(move.uci) || verdicts.has(move.uci)) continue
      verdicts.set(move.uci, {
        classification: classifyCandidate(
          best.score,
          move.score,
          whiteToMove,
          move.uci === bestUci,
        ),
        score: move.score,
      })
    }
  }
  return verdicts
}

/**
 * Whether a verdict is worth colouring in the list.
 *
 * The same rule the move list uses: "good" and "excellent" are silent there
 * because between them they cover most of a game, and a column where almost
 * every row is coloured says nothing. What is left — the engine's own choice,
 * and the three grades of error — is exactly what is worth seeing beside a
 * probability.
 */
export function isColoured(classification: Classification): boolean {
  return classification !== 'good' && classification !== 'excellent'
}
