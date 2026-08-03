interface PaneProps {
  title: string
  /** One line under the title saying what the pane is for. */
  hint?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Closed and unopenable. The panes after the first describe a game that does
   * not exist yet, so until one is converted they say why rather than opening
   * on nothing.
   */
  locked?: boolean
  lockedHint?: string
  /** Shown on the right of the summary line, e.g. a file name or a count. */
  aside?: React.ReactNode
  children: React.ReactNode
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/**
 * One step of the PGN File page, collapsible.
 *
 * The page is a sequence — load, edit, check, export — so the steps stack in
 * that order and each opens on its own. Keeping them independent rather than
 * making one close another is deliberate: comparing the tags against the
 * output is exactly the thing this page is for.
 */
export default function Pane({
  title,
  hint,
  open,
  onOpenChange,
  locked = false,
  lockedHint,
  aside,
  children,
}: PaneProps) {
  const shown = open && !locked
  return (
    <details
      open={shown}
      className={`shrink-0 rounded-xl border border-rule bg-card shadow-sm ${
        locked ? 'opacity-60' : ''
      }`}
    >
      <summary
        onClick={(e) => {
          // A locked pane keeps its summary in the tab order and readable, but
          // clicking it must not open an empty step.
          e.preventDefault()
          if (!locked) onOpenChange(!open)
        }}
        aria-disabled={locked || undefined}
        title={locked ? lockedHint : undefined}
        className={`flex list-none items-center gap-2 px-4 py-2.5 ${
          locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-buff-soft/40'
        }`}
      >
        {locked ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        ) : (
          <Chevron open={shown} />
        )}
        <span className="whitespace-nowrap font-display text-base font-semibold">{title}</span>
        {/* The hint is the first thing to go on a narrow screen: the title
            alone says which step this is, and wrapping it reads as a fault. */}
        {hint && <span className="hidden truncate text-xs text-ink-mute sm:inline">— {hint}</span>}
        <span className="ml-auto shrink-0 truncate text-xs text-ink-mute">
          {locked ? lockedHint : aside}
        </span>
      </summary>
      <div className="border-t border-rule px-4 py-3">{children}</div>
    </details>
  )
}
