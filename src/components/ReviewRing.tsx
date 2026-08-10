import { REVIEW_DEPTH } from '../lib/engine/analysis'

interface ReviewRingProps {
  progress: { done: number; total: number } | null
}

// The arc is the circle itself, dashed: one dash the length of the whole
// circumference, pulled back by however much of it should not be drawn.
const R = 6
const C = 2 * Math.PI * R

/**
 * The whole-game review's progress, small enough to sit in the engine pane's
 * header row.
 *
 * It reads as a ring there rather than as a bar above the board because the
 * bar came and went with every move added: on a phone the board and the move
 * list were pushed down and back up on each one.
 */
export default function ReviewRing({ progress }: ReviewRingProps) {
  const done = progress?.done ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? (done / total) * 100 : 0
  const label =
    total > 0
      ? `Reviewing with Stockfish 18 (d${REVIEW_DEPTH}) — ${done} of ${total} positions, ${Math.round(pct)}%`
      : 'Starting the engine review…'

  return (
    <span
      role="progressbar"
      aria-label="Engine review progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={total > 0 ? Math.round(pct) : undefined}
      title={label}
      className="shrink-0"
    >
      {/* Until a total is known there is nothing to fill towards, so a quarter
          of the ring spins instead of standing at zero looking stalled. */}
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={`size-4 ${total > 0 ? '-rotate-90' : 'animate-spin'}`}
      >
        {/* The track is the rule colour, not the field one: against the card
            underneath, a field-coloured ring is all but invisible in light
            themes and the first few percent looked like nothing at all. */}
        <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" className="stroke-rule" />
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={total > 0 ? C * (1 - pct / 100) : C * 0.75}
          className="stroke-felt transition-[stroke-dashoffset] duration-200"
        />
      </svg>
    </span>
  )
}
