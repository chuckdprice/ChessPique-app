import { REVIEW_DEPTH } from '../lib/engine/analysis'

interface AnalysisProgressProps {
  progress: { done: number; total: number } | null
  error: string | null
}

/**
 * Prominent, always-visible banner shown while the loaded game is being
 * reviewed by the engine (the in-tab indicator explains the empty charts).
 */
export default function AnalysisProgress({ progress, error }: AnalysisProgressProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-warn-text/25 bg-warn-bg px-5 py-3 text-sm text-warn-text"
      >
        Engine review unavailable: {error} — clocks, board, and move times still work.
      </div>
    )
  }

  const done = progress?.done ?? 0
  const total = progress?.total ?? 0
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-rule bg-card px-5 py-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">
          Reviewing the game with Stockfish 18
          <span className="ml-2 font-score text-xs font-normal text-ink-mute">
            depth {REVIEW_DEPTH}
          </span>
        </p>
        <p className="font-score text-xs text-ink-mute tabular-nums">
          {total > 0 ? `${done} / ${total} positions · ${Math.round(pct)}%` : 'starting engine…'}
        </p>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-buff-soft"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={total > 0 ? Math.round(pct) : undefined}
        aria-label="Engine review progress"
      >
        {total > 0 ? (
          <div
            className="h-full rounded-full bg-felt transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-felt/60" />
        )}
      </div>
      <p className="mt-2 text-xs text-ink-mute">
        Move classification, accuracy, and the evaluation chart appear when this finishes. You
        can step through the game and download the PGN right now.
      </p>
    </div>
  )
}
