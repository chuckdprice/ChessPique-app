import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isUsername } from '../lib/settings'

interface PlayerDialogProps {
  /** Usernames looked up before, newest first. */
  recent: string[]
  /** The one being read now, so it can be marked. */
  current: string
  onChoose: (username: string) => void
  onClose: () => void
}

/**
 * "Personal opening explorer": pick whose games to read.
 *
 * Lichess puts this behind its own dialog rather than in the filter panel, and
 * it is right to: choosing a player is not adjusting a filter, it is choosing
 * the whole subject. The names already looked up are one click each, which is
 * what makes preparing against the same club opponents week after week quick.
 */
export default function PlayerDialog({
  recent,
  current,
  onChoose,
  onClose,
}: PlayerDialogProps) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // The board reads arrow keys off the window, and it must not walk the
      // game while someone is typing a username into a box on top of it.
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const name = typed.trim()
  const valid = isUsername(name)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Personal opening explorer"
        className="w-full max-w-sm rounded-xl border border-rule bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">Personal opening explorer</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player picker"
            className="rounded-md px-2 py-0.5 text-ink-mute hover:bg-buff-soft hover:text-ink"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onChoose(name)
          }}
        >
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search by username"
            aria-label="Lichess username"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="mt-3 w-full rounded-lg border border-rule bg-field px-3 py-2 text-sm"
          />
          {/* Said before the request rather than after: an invalid name comes
              back from Lichess as an empty explorer, which reads as "this
              player has never played this position". */}
          {name.length > 0 && !valid && (
            <p className="mt-1 text-xs text-class-blunder">
              Not a Lichess username — letters, digits, underscore and hyphen, 2 to 30 of them.
            </p>
          )}
          <button
            type="submit"
            disabled={!valid}
            className="mt-3 w-full rounded-lg bg-felt px-3 py-2 text-sm font-medium text-buff transition-colors hover:bg-felt-deep disabled:opacity-40"
          >
            Look up {valid ? name : 'a player'}
          </button>
        </form>

        {recent.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium text-ink-mute">Looked up before</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recent.map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => onChoose(who)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    who.toLowerCase() === current.toLowerCase()
                      ? 'bg-felt text-buff'
                      : 'bg-buff-soft text-ink hover:bg-rule'
                  }`}
                >
                  {who}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
