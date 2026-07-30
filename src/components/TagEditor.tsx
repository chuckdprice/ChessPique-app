import PgnActions from './PgnActions'

interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
  pgn: string
  downloadName: string
}

export default function TagEditor({
  headers,
  onChange,
  pgn,
  downloadName,
}: TagEditorProps) {
  return (
    <section
      aria-label="PGN tags"
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div>
          <h2 className="font-display text-base font-semibold">PGN tags</h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            Edits flow straight into the converted PGN, the download, and the clipboard copy.
          </p>
        </div>
        <PgnActions pgn={pgn} fileName={downloadName} compact />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
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
      </div>
    </section>
  )
}
