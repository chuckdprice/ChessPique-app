import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  title: string
  /** What is about to happen, and what it costs. */
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A question asked before something that cannot be undone.
 *
 * Cancel takes the focus, not the confirm button: the dialog only appears when
 * there is something to lose, so the safe answer should be the one a stray
 * Return key gives.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-xl border border-rule bg-card p-5 text-ink shadow-lg"
      >
        <h2 id="confirm-title" className="font-display text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-mute">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-felt px-3 py-1.5 text-sm font-medium text-buff transition-colors hover:bg-felt-deep"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
