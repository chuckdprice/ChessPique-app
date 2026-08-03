import type { Opening } from '../lib/openings'

interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
  /** Named opening for the read-only field; null until the book has loaded. */
  opening: Opening | null
}

/**
 * The game's tags, laid out for editing. Tag names come from the converted game
 * and are fixed; only their values are editable, by index.
 */
export default function TagEditor({ headers, onChange, opening }: TagEditorProps) {
  if (headers.length === 0) {
    return (
      <p className="text-sm text-ink-mute">
        Tags appear here once you convert a game. Paste or upload a PGN above, then convert it.
      </p>
    )
  }

  return (
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
      {/* Read-only: the opening is looked up from the moves, so typing over it
          would only disagree with the game itself. */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
          Opening
        </span>
        <input
          type="text"
          readOnly
          value={opening ? `${opening.eco}: ${opening.name}` : ''}
          placeholder="not in the opening book"
          title="Looked up from the moves — written to the PGN as the ECO and Opening tags"
          className="w-full cursor-default rounded-md border border-rule bg-buff-soft/20 px-2.5 py-1.5 text-sm text-ink-mute"
        />
      </label>
    </div>
  )
}
