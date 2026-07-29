interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
}

export default function TagEditor({ headers, onChange }: TagEditorProps) {
  return (
    <section
      aria-label="PGN tags"
      className="rounded-xl border border-rule bg-card shadow-sm"
    >
      <div className="border-b border-rule px-4 py-3">
        <h2 className="font-display text-base font-semibold">PGN tags</h2>
        <p className="mt-0.5 text-xs text-ink-mute">
          Edits are saved into the downloaded file.
        </p>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto px-4 py-4">
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
    </section>
  )
}
