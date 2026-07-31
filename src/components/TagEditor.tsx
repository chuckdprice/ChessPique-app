interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
}

/**
 * Left pane of the PGN File page. Tag names come from the converted game and are
 * fixed; only their values are editable, by index.
 */
export default function TagEditor({ headers, onChange }: TagEditorProps) {
  return (
    <section
      aria-label="PGN tags"
      className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      <div className="shrink-0 border-b border-rule px-5 py-3">
        <h2 className="font-display text-base font-semibold">PGN tags</h2>
        <p className="mt-0.5 text-xs text-ink-mute">
          Edits flow straight into the converted PGN, the download, and the clipboard copy.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {headers.length === 0 ? (
          <p className="text-sm text-ink-mute">
            Tags appear here once you convert a game. Paste or upload a PGN on the Original PGN
            tab, then convert it.
          </p>
        ) : (
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-1 lg:grid-cols-2">
            {headers.map((header, index) => (
              <label key={`${header.name}-${index}`} className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
                  {header.name}
                </span>
                <input
                  type="text"
                  value={header.value}
                  onChange={(e) => onChange(index, e.target.value)}
                  className="w-full rounded-md border border-rule bg-buff-soft/50 px-2.5 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
