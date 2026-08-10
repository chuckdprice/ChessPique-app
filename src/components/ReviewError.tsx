interface ReviewErrorProps {
  error: string | null
}

/**
 * The one thing about the review that still needs a banner.
 *
 * Progress moved to a ring in the engine pane so that it stops reflowing the
 * page on every move; a failure stays here, because it needs the sentence.
 */
export default function ReviewError({ error }: ReviewErrorProps) {
  if (!error) return null

  return (
    <div
      role="alert"
      className="app-banner flex items-center gap-2 rounded-lg border border-warn-text/25 bg-warn-bg px-3 py-1.5 text-xs text-warn-text"
    >
      Engine review unavailable: {error} — clocks, board, and move times still work.
    </div>
  )
}
