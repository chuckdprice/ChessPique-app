import { MAIA_RATINGS } from '../lib/maia/model'
import { isColoured } from '../lib/maia/verdicts'
import type { Classification } from '../lib/engine/analysis'
import type { MaiaStatus } from '../lib/maia/session'
import BusyRing from './BusyRing'

/**
 * Maia's column: the moves a human of a given rating would probably play, and
 * what the engine thinks of each.
 *
 * This list has NO relationship to the engine's beside it. It is sorted by how
 * likely a human is to play the move; the engine's is sorted by how good the
 * move is. Row 2 here and row 2 there are different moves answering different
 * questions, and the only thing they share is that there are as many of each.
 */

export interface MaiaRow {
  uci: string
  san: string
  /** 0-1. */
  prob: number
  /** Absent until the engine has scored this move. */
  classification?: Classification
}

const COLOUR: Record<Classification, string> = {
  best: 'text-class-best',
  excellent: 'text-ink',
  good: 'text-ink',
  inaccuracy: 'text-class-inaccuracy',
  mistake: 'text-class-mistake',
  blunder: 'text-class-blunder',
}

/** What the first row says while it has no move to show. */
function waitingMessage(status: MaiaStatus, progress: number, error: string | null): string {
  if (status === 'downloading') return `Downloading… ${Math.round(progress * 100)}%`
  if (status === 'error') return error ?? 'Maia unavailable'
  return 'Thinking…'
}

interface MaiaColumnProps {
  rows: MaiaRow[]
  /** Rows to keep reserved, matching the engine's line count beside it. */
  rowCount: number
  /**
   * Whether the engine is still working out what these moves are worth. Maia
   * itself answers in one forward pass; the colours need a Stockfish search per
   * move it did not already cover, and that takes as long as the panel's own.
   */
  busy: boolean
  rating: number
  /** True when the rating is following the review's estimate rather than a pick. */
  auto: boolean
  onRatingChange: (rating: number | null) => void
  status: MaiaStatus
  /** 0-1 while downloading. */
  progress: number
  error: string | null
}

export default function MaiaColumn({
  rows,
  rowCount,
  busy,
  rating,
  auto,
  onRatingChange,
  status,
  progress,
  error,
}: MaiaColumnProps) {
  return (
    // Narrower than the engine's lines and able to give way: a move and a
    // percentage need far less room than a principal variation, but a fixed
    // width here left the lines nothing at all in a narrow panel.
    // The basis is set only alongside the lines, never above them: flex-basis
    // is the main axis, so in the stacked layout it becomes a 9rem *height* and
    // opens a gap under the last move.
    <div className="min-w-0 border-rule @[22rem]/evals:basis-60 @[22rem]/evals:border-r @[22rem]/evals:pr-3">
      {/* The heading is the control: it already has to say which rating is
          being shown, and a separate dropdown beside it would say it twice.
          Its height is fixed so that it and the engine's heading opposite sit
          on one line whatever either of them says. */}
      <div className="relative flex h-6 items-center gap-1">
        <span className="truncate text-xs font-semibold text-maia">
          Maia {rating}: Human Moves
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3 shrink-0 text-maia"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>

        {/* After the chevron rather than before it: appearing mid-heading
            pushed the chevron along and shortened the title to "Human Mo…"
            every time the engine started scoring. At the end it costs nothing
            already on screen. */}
        {busy && (
          <BusyRing
            pct={null}
            title="Scoring these moves with the engine — the colours are not final yet"
            ariaLabel="Scoring Maia's moves"
          />
        )}

        {/* A real <select> laid over the heading: 21 ratings want the platform's
            own picker, especially on a phone, and the heading stays the thing
            you click. */}
        <select
          aria-label="Maia rating"
          title="The rating Maia predicts for"
          value={auto ? 'auto' : String(rating)}
          onChange={(e) =>
            onRatingChange(e.target.value === 'auto' ? null : Number(e.target.value))
          }
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="auto">Match the player (~{rating})</option>
          {MAIA_RATINGS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {/* As many rows as the engine's list opposite, filled or not: a new
          position empties this list until the forward pass lands, and a list
          that shrinks and springs back bounces the whole pane. The waiting
          message goes in the first row rather than above them, so it costs no
          height of its own. */}
      <ul className="font-score text-xs">
        {Array.from({ length: rowCount }, (_, slot) => {
          const row = rows[slot]
          if (!row) {
            return (
              <li key={`pending-${slot}`} className="flex items-baseline py-0.5 text-ink-mute">
                {slot === 0 ? waitingMessage(status, progress, error) : ' '}
              </li>
            )
          }
          const colour =
            row.classification && isColoured(row.classification)
              ? COLOUR[row.classification]
              : 'text-ink'
          return (
            <li key={row.uci} className={`flex items-baseline justify-between py-0.5 ${colour}`}>
              <span className="truncate font-semibold">{row.san}</span>
              <span className="shrink-0 tabular-nums">{(row.prob * 100).toFixed(1)}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
