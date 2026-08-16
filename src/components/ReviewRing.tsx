import { REVIEW_DEPTH } from '../lib/engine/analysis'
import BusyRing from './BusyRing'

interface ReviewRingProps {
  progress: { done: number; total: number } | null
}

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
  const pct = total > 0 ? (done / total) * 100 : null
  const label =
    pct != null
      ? `Reviewing with Stockfish 18 (d${REVIEW_DEPTH}) — ${done} of ${total} positions, ${Math.round(pct)}%`
      : 'Starting the engine review…'

  return (
    <BusyRing pct={pct} title={label} ariaLabel="Engine review progress">
      {/* Wide enough for "100%" whatever it currently reads, so counting up
          does not shuffle whatever sits beside it along. */}
      <span className="min-w-[4ch] text-right font-score text-[10px] font-semibold leading-none tabular-nums">
        {pct != null ? `${Math.round(pct)}%` : '…'}
      </span>
    </BusyRing>
  )
}
