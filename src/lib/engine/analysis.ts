import { Chess } from 'chess.js'
import type { Move } from '../convert'
import { Engine } from './uci'
import type { Score } from './uci'

/**
 * Full-game analysis: per-position evals, per-move classification, accuracy,
 * "played like" ratings, and game-phase boundaries. The math mirrors the
 * published lichess win%/accuracy model; classification thresholds are
 * chess.com-style.
 */

export type Classification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export const CLASSIFICATIONS: Classification[] = [
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

export const CLASSIFICATION_SYMBOL: Record<Classification, string> = {
  best: '★',
  excellent: '!',
  good: '⊙',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

/**
 * Whether a classification earns a marker in the move list and on the board.
 * "Good" and "Excellent" are deliberately silent: between them they cover most
 * of a game, and marking them added noise without telling the reader anything.
 * The Move Classification tab still counts and labels both.
 */
export function hasMoveMarker(classification: Classification): boolean {
  return classification !== 'good' && classification !== 'excellent'
}

/** Win-percent-loss thresholds (mover's perspective). */
const EXCELLENT_MAX = 2
const GOOD_MAX = 5
const INACCURACY_MAX = 10
const MISTAKE_MAX = 20

export interface MoveAnalysis {
  /** 1-based ply, aligned with ReplayedGame.fens. */
  ply: number
  color: 'w' | 'b'
  scoreBefore: Score
  scoreAfter: Score
  /** Win-% the mover gave up with this move (>= 0). */
  winPctLoss: number
  /** Centipawn loss, capped at 1000. */
  cpl: number
  /** True when the position before the move was not already decided. */
  fromUndecided: boolean
  /** Per-move accuracy, 0-100. */
  accuracy: number
  classification: Classification
  bestMoveSan: string | null
  /**
   * The engine's whole line from the position before this move, in SAN, best
   * move first — what it would have played instead, and how it saw the game
   * continuing. Empty when the position was terminal or the search returned
   * nothing.
   */
  bestLineSan: string[]
}

export interface PhaseAccuracy {
  opening: number | null
  middlegame: number | null
  endgame: number | null
}

export interface PlayerSummary {
  accuracy: number
  acpl: number
  /**
   * Average win-% lost per move, over undecided positions where possible —
   * the input to the played-like estimate.
   */
  awl: number
  /** Estimated performance rating, rounded to PLAYED_LIKE_ROUNDING. */
  playedLike: number
  counts: Record<Classification, number>
  phaseAccuracy: PhaseAccuracy
}

export interface GameAnalysis {
  /** evals[i] = eval of fens[i] (white POV). Length = fens.length. */
  evals: Score[]
  /**
   * evalDepths[i] = depth actually reached for evals[i], Infinity for a
   * terminal position (mate or draw, which is exact and cannot be improved).
   *
   * The review aims for REVIEW_DEPTH but stops early at the movetime cap, so a
   * knotty middlegame can come in below it. Recorded because the live engine
   * only overrides an eval it has genuinely out-searched, and against a flat
   * assumed depth that comparison would be wrong in both directions.
   */
  evalDepths: number[]
  moves: MoveAnalysis[]
  white: PlayerSummary
  black: PlayerSummary
  /** 1-based ply where each phase begins (null if never reached). */
  middlegameStartPly: number | null
  endgameStartPly: number | null
}

/** Classifications that earn a "best move was…" note and a variation. */
export const NEEDS_ADVICE: Classification[] = ['inaccuracy', 'mistake', 'blunder']

/**
 * The engine's verdict on a move as a sentence — "Inaccuracy. Bb5 was best." —
 * or null for a move that needs no comment.
 *
 * Shared so the move list and the exported PGN say the same thing.
 */
export function moveNote(move: MoveAnalysis): string | null {
  if (!NEEDS_ADVICE.includes(move.classification)) return null
  const label = CLASSIFICATION_LABEL[move.classification]
  return move.bestMoveSan ? `${label}. ${move.bestMoveSan} was best.` : `${label}.`
}

/**
 * A SAN line written as numbered movetext — "5. Bb5 Nd7 6. Bxc6" — starting at
 * the given move number and side.
 *
 * Black's first move takes the "5..." form, and only that one: once the line is
 * under way the numbers alternate normally.
 */
export function formatVariation(
  sans: string[],
  startNumber: number,
  startColor: 'w' | 'b',
): string {
  let number = startNumber
  let white = startColor === 'w'
  const parts: string[] = []
  for (const [i, san] of sans.entries()) {
    if (white) parts.push(`${number}. ${san}`)
    else if (i === 0) parts.push(`${number}... ${san}`)
    else parts.push(san)
    if (!white) number += 1
    white = !white
  }
  return parts.join(' ')
}

/** The engine's line for a flagged move, numbered; empty when there is none. */
export function moveVariation(move: MoveAnalysis): string {
  if (!NEEDS_ADVICE.includes(move.classification) || move.bestLineSan.length === 0) return ''
  return formatVariation(move.bestLineSan, Math.ceil(move.ply / 2), move.color)
}

/** A position's evaluation together with the depth that produced it. */
export interface RefinedEval {
  score: Score
  depth: number
}

/**
 * Fold a live engine result into the deepened evaluations, keyed by ply.
 *
 * The whole-game review runs at a fixed depth, but the live engine is left to
 * think for as long as the user stands on a position and routinely passes it.
 * When it does, its number is the better one and replaces what the move list
 * shows — otherwise the move list and the engine panel sit side by side
 * disagreeing about the same position.
 *
 * Shallower or equal results are dropped, and the map is returned unchanged so
 * a re-render costs nothing.
 */
export function withDeeperEval(
  refined: Map<number, RefinedEval>,
  ply: number,
  candidate: RefinedEval,
  reviewDepth: number,
): Map<number, RefinedEval> {
  const shown = refined.get(ply)?.depth ?? reviewDepth
  if (!(candidate.depth > shown)) return refined
  const next = new Map(refined)
  next.set(ply, candidate)
  return next
}

// ---------------------------------------------------------------------------
// Pure math

/** White's winning chances 0-100 from a white-POV score (lichess model). */
export function winPct(score: Score): number {
  if (score.mate != null) return score.mate > 0 ? 100 : 0
  const cp = Math.max(-1500, Math.min(1500, score.cp ?? 0))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Score as centipawns for ACPL, with mate clamped to ±1000. */
export function scoreCp(score: Score): number {
  if (score.mate != null) return score.mate > 0 ? 1000 : -1000
  return Math.max(-1000, Math.min(1000, score.cp ?? 0))
}

/** Per-move accuracy from win-% loss (lichess formula), clamped 0-100. */
export function moveAccuracy(winPctLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * winPctLoss) - 3.1669
  return Math.max(0, Math.min(100, raw))
}

export function classify(winPctLoss: number, playedBest: boolean): Classification {
  if (playedBest) return 'best'
  if (winPctLoss <= EXCELLENT_MAX) return 'excellent'
  if (winPctLoss <= GOOD_MAX) return 'good'
  if (winPctLoss <= INACCURACY_MAX) return 'inaccuracy'
  if (winPctLoss <= MISTAKE_MAX) return 'mistake'
  return 'blunder'
}

/**
 * A position this far from equal is treated as already decided. Move quality
 * there says little about strength — cheap "still winning" moves and desperate
 * losing ones both distort the numbers — so those plies are excluded from the
 * rating estimate.
 */
export const DECIDED_CP = 400
/** Below this many undecided plies, fall back to all of a player's moves. */
const MIN_UNDECIDED_MOVES = 8

/**
 * Calibrated rating curve: rating = PLAYED_LIKE_A - PLAYED_LIKE_B * ln(average
 * win-% lost per move in undecided positions).
 *
 * Fitted by scripts/calibrate-rating.mjs + scripts/fit-rating-curve.mjs over 50
 * rated Lichess *rapid* games (100 player-samples, ratings 740-2431) analyzed
 * with the same REVIEW_DEPTH search this app uses. That script compares several
 * candidate metrics; this one measured best (R² 0.31, MAE 331 Elo) against raw
 * ACPL (R² 0.18), capped ACPL (0.20), median CPL (0.07), and accuracy (0.19).
 *
 * Two limits are inherent to the method, not defects:
 *  - The result sits on the **Lichess rapid scale**, which runs higher than
 *    USCF/FIDE OTB ratings for the same player.
 *  - A single game is a weak rating signal (R² 0.31): quiet games look strong
 *    and sharp games look weak whoever is playing. Hence the coarse rounding,
 *    the "~" prefix, and the explanation on hover.
 */
export const PLAYED_LIKE_A = 2142
export const PLAYED_LIKE_B = 411
/** Mean absolute error of the fit, in Elo — quoted in the UI tooltip. */
export const PLAYED_LIKE_MAE = 331
const PLAYED_LIKE_ROUNDING = 100

/** Estimated performance rating from average win-% loss in undecided positions. */
export function playedLikeRating(avgWinPctLoss: number): number {
  const raw = PLAYED_LIKE_A - PLAYED_LIKE_B * Math.log(Math.max(0.25, avgWinPctLoss))
  const clamped = Math.max(400, Math.min(3000, raw))
  return Math.round(clamped / PLAYED_LIKE_ROUNDING) * PLAYED_LIKE_ROUNDING
}

/** Non-pawn, non-king material (both sides) in pawns-equivalent points. */
export function pieceMaterial(fen: string): number {
  const board = fen.split(' ')[0]
  const values: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 }
  let total = 0
  for (const ch of board) {
    const v = values[ch.toLowerCase()]
    if (v) total += v
  }
  return total
}

const OPENING_PLIES = 20
const ENDGAME_MATERIAL_MAX = 13

export type Phase = 'opening' | 'middlegame' | 'endgame'

/**
 * Phase boundaries: the endgame begins at the first ply whose pre-move
 * position has combined piece material <= 13; the middlegame begins after
 * ply 20 (if the endgame hasn't already started).
 */
export function findPhases(fens: string[]): {
  middlegameStartPly: number | null
  endgameStartPly: number | null
} {
  const totalPlies = fens.length - 1
  let endgameStartPly: number | null = null
  for (let ply = 1; ply <= totalPlies; ply++) {
    if (pieceMaterial(fens[ply - 1]) <= ENDGAME_MATERIAL_MAX) {
      endgameStartPly = ply
      break
    }
  }
  let middlegameStartPly: number | null =
    totalPlies > OPENING_PLIES ? OPENING_PLIES + 1 : null
  if (endgameStartPly != null && middlegameStartPly != null && endgameStartPly <= middlegameStartPly) {
    middlegameStartPly = null
  }
  return { middlegameStartPly, endgameStartPly }
}

export function phaseOfPly(
  ply: number,
  phases: { middlegameStartPly: number | null; endgameStartPly: number | null },
): Phase {
  if (phases.endgameStartPly != null && ply >= phases.endgameStartPly) return 'endgame'
  if (phases.middlegameStartPly != null && ply >= phases.middlegameStartPly) return 'middlegame'
  return 'opening'
}

/** Build per-move analyses and player summaries from raw evals + best moves. */
export function buildGameAnalysis(
  fens: string[],
  moves: Move[],
  evals: Score[],
  bestMoves: Array<{ uci: string | null; san: string | null; line?: string[] }>,
  playedUcis: string[],
  /** Depth behind each eval; a gap here reads as "unknown" downstream. */
  evalDepths: number[] = [],
): GameAnalysis {
  const phases = findPhases(fens)
  const moveAnalyses: MoveAnalysis[] = moves.map((move, i) => {
    const ply = i + 1
    const scoreBefore = evals[ply - 1]
    const scoreAfter = evals[ply]
    const before = winPct(scoreBefore)
    const after = winPct(scoreAfter)
    const isWhite = move.color === 'w'
    const winPctLoss = Math.max(0, isWhite ? before - after : after - before)
    const cpl = Math.max(
      0,
      isWhite ? scoreCp(scoreBefore) - scoreCp(scoreAfter) : scoreCp(scoreAfter) - scoreCp(scoreBefore),
    )
    const playedBest = bestMoves[i]?.uci != null && bestMoves[i].uci === playedUcis[i]
    return {
      ply,
      color: move.color,
      scoreBefore,
      scoreAfter,
      winPctLoss,
      cpl,
      fromUndecided: Math.abs(scoreCp(scoreBefore)) <= DECIDED_CP,
      accuracy: moveAccuracy(winPctLoss),
      classification: classify(winPctLoss, playedBest),
      bestMoveSan: bestMoves[i]?.san ?? null,
      bestLineSan: bestMoves[i]?.line ?? [],
    }
  })

  const summarize = (color: 'w' | 'b'): PlayerSummary => {
    const own = moveAnalyses.filter((m) => m.color === color)
    const mean = (xs: number[]) =>
      xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
    const counts = Object.fromEntries(
      CLASSIFICATIONS.map((c) => [c, own.filter((m) => m.classification === c).length]),
    ) as Record<Classification, number>
    const phaseAcc = (phase: Phase): number | null => {
      const inPhase = own.filter((m) => phaseOfPly(m.ply, phases) === phase)
      return inPhase.length === 0 ? null : mean(inPhase.map((m) => m.accuracy))
    }
    const acpl = mean(own.map((m) => m.cpl))
    // Prefer undecided positions; a game decided early would otherwise leave
    // too few moves to say anything.
    const undecided = own.filter((m) => m.fromUndecided)
    const awl = mean(
      (undecided.length >= MIN_UNDECIDED_MOVES ? undecided : own).map((m) => m.winPctLoss),
    )
    return {
      accuracy: mean(own.map((m) => m.accuracy)),
      acpl,
      awl,
      playedLike: playedLikeRating(awl),
      counts,
      phaseAccuracy: {
        opening: phaseAcc('opening'),
        middlegame: phaseAcc('middlegame'),
        endgame: phaseAcc('endgame'),
      },
    }
  }

  return {
    evals,
    evalDepths,
    moves: moveAnalyses,
    white: summarize('w'),
    black: summarize('b'),
    ...phases,
  }
}

// ---------------------------------------------------------------------------
// Batch engine runner

/**
 * Batch-review search limits. Depth-based for consistency across positions,
 * with a time cap so pathological positions can't stall the review. These are
 * the settings the "played like" curve was calibrated against
 * (scripts/calibrate-rating.mjs) — changing them invalidates that fit.
 */
export const REVIEW_DEPTH = 20
export const REVIEW_MOVETIME_CAP_MS = 2500

export interface AnalyzeGameOptions {
  depth?: number
  movetimeMs?: number
  onProgress?: (done: number, total: number) => void
  /** Flip to true to abort; the promise then resolves null. */
  signal?: { cancelled: boolean }
}

/** Terminal-position score without engine help (checkmate / drawn). */
function terminalScore(fen: string): Score | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) {
    return { mate: chess.turn() === 'w' ? -1 : 1 }
  }
  if (chess.isDraw()) return { cp: 0 }
  return null
}

export async function analyzeGame(
  fens: string[],
  moves: Move[],
  playedUcis: string[],
  options: AnalyzeGameOptions = {},
): Promise<GameAnalysis | null> {
  const {
    depth = REVIEW_DEPTH,
    movetimeMs = REVIEW_MOVETIME_CAP_MS,
    onProgress,
    signal,
  } = options
  const engine = new Engine()
  try {
    await engine.init({ hashMb: 64, multiPv: 1 })
    const evals: Score[] = []
    const evalDepths: number[] = []
    const bestMoves: Array<{ uci: string | null; san: string | null; line: string[] }> = []

    for (let i = 0; i < fens.length; i++) {
      if (signal?.cancelled) return null
      const terminal = terminalScore(fens[i])
      if (terminal) {
        evals.push(terminal)
        // Nothing to search and nothing deeper to find.
        evalDepths.push(Number.POSITIVE_INFINITY)
        bestMoves.push({ uci: null, san: null, line: [] })
      } else {
        const result = await engine.analyze({ fen: fens[i], depth, movetimeMs, multiPv: 1 })
        const top = result.lines[0]
        evals.push(top?.score ?? { cp: 0 })
        // The depth reached, which the movetime cap can hold below `depth`.
        evalDepths.push(top?.depth ?? 0)
        bestMoves.push({
          uci: result.bestMoveUci,
          san: top?.pvSan[0] ?? null,
          // The whole line, not just its first move: the move list and the
          // exported PGN both show what the engine would have played on.
          line: top?.pvSan ?? [],
        })
      }
      onProgress?.(i + 1, fens.length)
    }

    if (signal?.cancelled) return null
    return buildGameAnalysis(fens, moves, evals, bestMoves, playedUcis, evalDepths)
  } finally {
    engine.destroy()
  }
}
