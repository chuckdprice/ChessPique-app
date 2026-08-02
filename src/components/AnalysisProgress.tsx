import { REVIEW_DEPTH } from '../lib/engine/analysis'

interface AnalysisProgressProps {
  progress: { done: number; total: number } | null
  error: string | null
}

/** Compact one-line review status; kept short so it costs almost no height. */
export default function AnalysisProgress({ progress, error }: AnalysisProgressProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-warn-text/25 bg-warn-bg px-3 py-1.5 text-xs text-warn-text"
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
      className="app-banner flex items-center gap-3 rounded-lg border border-rule bg-card px-3 py-1.5"
    >
      <span className="shrink-0 text-xs font-medium">
        Reviewing with Stockfish 18
        <span className="ml-1.5 font-score text-ink-mute">d{REVIEW_DEPTH}</span>
      </span>
      <div
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-buff-soft"
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
      <span className="shrink-0 font-score text-xs text-ink-mute tabular-nums">
        {total > 0 ? `${done}/${total} · ${Math.round(pct)}%` : 'starting…'}
      </span>
    </div>
  )
}
