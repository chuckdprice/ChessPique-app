import { REVIEW_DEPTH } from '../lib/engine/analysis'

interface ReviewRingProps {
  progress: { done: number; total: number } | null
}

// The arc is the circle itself, dashed: one dash the length of the whole
// circumference, pulled back by however much of it should not be drawn.
const R = 6
const C = 2 * Math.PI * R

/**
 * Gold, and the ink that reads on it — fixed rather than themed, like the
 * engine's blue arrows. Every theme in the app is quiet by design, so nothing
 * in the palette is loud enough to say "something is running" on its own; this
 * is the one badge on the page meant to be noticed rather than read.
 */
const RUNNING_BG = '#f2b705'
const RUNNING_INK = '#3d2f00'
const RUNNING_TRACK = 'rgba(61, 47, 0, 0.22)'

/**
 * The whole-game review's progress, small enough to sit in the engine pane's
 * header row.
 *
 * It reads as a ring there rather than as a bar above the board because the
 * bar came and went with every move added: on a phone the board and the move
 * list were pushed down and back up on each one. Nothing here is taller than
 * the depth badge beside it, so the row it sits in cannot change height.
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
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5"
      style={{ background: RUNNING_BG, color: RUNNING_INK }}
    >
      {/* Until a total is known there is nothing to fill towards, so a quarter
          of the ring spins instead of standing at zero looking stalled. */}
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={`size-4 ${total > 0 ? '-rotate-90' : 'animate-spin'}`}
      >
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          strokeWidth="2.5"
          stroke={RUNNING_TRACK}
        />
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={C}
          strokeDashoffset={total > 0 ? C * (1 - pct / 100) : C * 0.75}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      {/* Wide enough for "100%" whatever it currently reads, so counting up
          does not shuffle the engine's name along beside it. */}
      <span className="min-w-[4ch] text-right font-score text-[10px] font-semibold leading-none tabular-nums">
        {total > 0 ? `${Math.round(pct)}%` : '…'}
      </span>
    </span>
  )
}
