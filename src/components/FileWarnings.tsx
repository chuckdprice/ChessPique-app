interface FileWarningsProps {
  warnings: string[]
  onDismiss: () => void
}

/** Beyond this the list is a wall of text and says nothing the count does not. */
const SHOWN = 4

/**
 * What did not come through from the file as written.
 *
 * These used to be collected and never shown, which is worst for the one that
 * matters most: a variation containing an unplayable move is dropped, and
 * without this the line simply was not there and nothing said so.
 *
 * Two kinds arrive here — a line the parser could not play, and a move whose
 * clock had to be assumed — and the first is listed first, because one is lost
 * work and the other only an approximation.
 *
 * Dismissible because the game is still usable — nothing here stops the board,
 * the review or the export.
 */
export default function FileWarnings({ warnings, onDismiss }: FileWarningsProps) {
  if (warnings.length === 0) return null
  const shown = warnings.slice(0, SHOWN)
  const rest = warnings.length - shown.length

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warn-text/25 bg-warn-bg px-3 py-1.5 text-xs text-warn-text"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-px size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {warnings.length === 1
            ? 'One thing in this file did not come through as written:'
            : `${warnings.length} things in this file did not come through as written:`}
        </p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          {shown.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
          {rest > 0 && <li>…and {rest} more.</li>}
        </ul>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss warnings"
        className="shrink-0 rounded px-1.5 py-0.5 text-sm leading-none transition-colors hover:bg-warn-text/10"
      >
        ×
      </button>
    </div>
  )
}
