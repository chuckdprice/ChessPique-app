import { useEffect, useRef } from 'react'
import { GROUPS, isCopyleft, SOURCE_URL } from '../lib/licenses'

interface LicensesDialogProps {
  onClose: () => void
}

/**
 * Who made what this is built out of, and under what terms.
 *
 * The copyleft rows are marked rather than listed apart, because grouping by
 * licence would separate Stockfish from the network it runs and Maia from the
 * runtime that loads it — the reader is looking for a component, not a licence.
 * The source link sits above the tables instead of under them: for GPL and AGPL
 * it is the part that does the work, and a credit alone would not.
 */
export default function LicensesDialog({ onClose }: LicensesDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="licenses-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-rule bg-card text-ink shadow-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 id="licenses-title" className="font-display text-lg font-semibold">
              Licenses
            </h2>
            <p className="mt-0.5 text-xs text-ink-mute">
              The open source projects, libraries and assets ChessPique is built from. Thank you to
              everyone who works on them.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close licenses"
            className="shrink-0 rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-rule bg-buff-soft/60 px-4 py-3 text-sm leading-relaxed">
            <p>
              Stockfish and Maia-3 are under copyleft licences, and Maia-3's{' '}
              <span className="font-medium text-ink">AGPL-3.0</span> covers anyone using this app
              over a network, not only someone handed a copy. Those licences ask for source rather
              than for credit, so:{' '}
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline underline-offset-2"
              >
                the complete source for ChessPique is on GitHub
              </a>
              .
            </p>
          </div>

          {GROUPS.map((group) => (
            <section key={group.title} className="mt-6">
              <h3 className="font-display text-base font-semibold">{group.title}</h3>
              {group.note && <p className="mt-1 text-xs text-ink-mute">{group.note}</p>}
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-mute">
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                      License
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.name} className="border-b border-rule/60 last:border-0">
                      <td className="py-1.5 pr-3 align-top">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-rule underline-offset-2 hover:decoration-current"
                          >
                            {row.name}
                          </a>
                        ) : (
                          row.name
                        )}
                        {row.author && (
                          <span className="block text-xs text-ink-mute">{row.author}</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-3 text-right align-top whitespace-nowrap">
                        <span className={isCopyleft(row.license) ? 'font-medium text-ink' : 'text-ink-mute'}>
                          {row.license}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
