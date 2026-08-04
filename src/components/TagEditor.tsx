import type { Opening } from '../lib/openings'

interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
  /** Named opening for the read-only field; null until the book has loaded. */
  opening: Opening | null
}

/**
 * Tags the app writes itself, so editing them here would achieve nothing: the
 * value typed in would be overwritten on the way out. ECO and Opening are shown
 * together in one read-only field instead of two editable ones.
 */
const GENERATED = new Set(['ECO', 'Opening'])
const READ_ONLY = new Set(['Annotator'])

const FIELD_CLASS = 'w-full rounded-md border border-rule px-2.5 py-1.5 text-sm'
const EDITABLE_CLASS = `${FIELD_CLASS} bg-buff-soft/50`
const READ_ONLY_CLASS = `${FIELD_CLASS} cursor-default bg-buff-soft/20 text-ink-mute`

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((header) => header.name === name)?.value
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

  // What the converted PGN will carry: the book's answer where there is one,
  // otherwise whatever the source file already said.
  const eco = opening?.eco ?? findHeader(headers, 'ECO') ?? ''
  const name = opening?.name ?? findHeader(headers, 'Opening') ?? ''
  const openingText = [eco, name].filter(Boolean).join(': ')

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {headers.map((header, index) =>
        GENERATED.has(header.name) ? null : (
          <label key={`${header.name}-${index}`} className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
              {header.name}
            </span>
            <input
              type="text"
              value={header.value}
              readOnly={READ_ONLY.has(header.name)}
              title={
                READ_ONLY.has(header.name) ? 'Written by this app on every conversion' : undefined
              }
              onChange={(e) => onChange(index, e.target.value)}
              className={READ_ONLY.has(header.name) ? READ_ONLY_CLASS : EDITABLE_CLASS}
            />
          </label>
        ),
      )}
      {/* Read-only: the opening is looked up from the moves, so typing over it
          would only disagree with the game itself. */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
          Opening
        </span>
        <input
          type="text"
          readOnly
          value={openingText}
          placeholder="not in the opening book"
          title="Looked up from the moves — written to the PGN as the ECO and Opening tags"
          className={READ_ONLY_CLASS}
        />
      </label>
    </div>
  )
}
