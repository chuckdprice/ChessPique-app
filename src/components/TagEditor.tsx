import { STANDARD_TAGS } from '../lib/convert'
import type { Opening } from '../lib/openings'

interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
  /** Add a tag the game does not carry yet, with an empty value. */
  onAdd: (name: string) => void
  /** Drop a tag from the game, and so from the converted PGN. */
  onRemove: (index: number) => void
  /** The tags the app writes on every conversion, with the values it will use. */
  generated: Array<{ name: string; value: string }>
  /** Named opening for the read-only field; null until the book has loaded. */
  opening: Opening | null
}

/**
 * Tags the app writes itself, so editing them here would achieve nothing: the
 * value typed in would be overwritten on the way out. ECO and Opening are shown
 * together in one read-only field instead of two editable ones.
 */
const GENERATED = new Set(['ECO', 'Opening', 'Annotator'])

const FIELD_CLASS = 'w-full rounded-md border border-rule px-2.5 py-1.5 text-sm'
const EDITABLE_CLASS = `${FIELD_CLASS} bg-buff-soft/50`
const READ_ONLY_CLASS = `${FIELD_CLASS} cursor-default bg-buff-soft/20 text-ink-mute`

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((header) => header.name === name)?.value
}

/**
 * One tag: its name, a way to drop it where there is one, and its box.
 *
 * A <div> rather than a <label>, because the remove button would be a control
 * nested inside one; the box carries the name as its own accessible label.
 */
function Field({
  name,
  onRemove,
  children,
}: {
  name: string
  onRemove?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-center gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-mute">{name}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove the ${name} tag`}
            title={`Remove the ${name} tag`}
            className="rounded p-0.5 text-ink-mute transition-colors hover:bg-danger-bg hover:text-danger-text"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" />
            </svg>
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * The game's tags, laid out for editing.
 *
 * Two kinds are shown. The game's own tags are editable by index — their names
 * are fixed, their values are not — and the app's own tags are shown read-only
 * whether or not the source file had them, because they go into the converted
 * PGN either way and a file with no tags at all would otherwise show nothing.
 */
export default function TagEditor({
  headers,
  onChange,
  onAdd,
  onRemove,
  generated,
  opening,
}: TagEditorProps) {
  if (headers.length === 0 && generated.length === 0) {
    return (
      <p className="text-sm text-ink-mute">
        Tags appear here once you convert a game. Paste or upload a PGN above, then convert it.
      </p>
    )
  }

  // What the converted PGN will carry: the book's answer where there is one,
  // otherwise whatever the source file already said.
  const eco = opening?.eco ?? findHeader(generated, 'ECO') ?? findHeader(headers, 'ECO') ?? ''
  const name =
    opening?.name ?? findHeader(generated, 'Opening') ?? findHeader(headers, 'Opening') ?? ''
  const openingText = [eco, name].filter(Boolean).join(': ')
  const annotator = findHeader(generated, 'Annotator') ?? findHeader(headers, 'Annotator') ?? ''

  const missing = STANDARD_TAGS.filter((tag) => !headers.some((header) => header.name === tag))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {headers.map((header, index) =>
          GENERATED.has(header.name) ? null : (
            <Field
              key={`${header.name}-${index}`}
              name={header.name}
              onRemove={() => onRemove(index)}
            >
              <input
                type="text"
                aria-label={header.name}
                value={header.value}
                onChange={(e) => onChange(index, e.target.value)}
                className={EDITABLE_CLASS}
              />
            </Field>
          ),
        )}

        {/* Read-only: the opening is looked up from the moves, so typing over
            it would only disagree with the game itself. */}
        <Field name="Opening">
          <input
            type="text"
            aria-label="Opening"
            readOnly
            value={openingText}
            placeholder="not in the opening book"
            title="Looked up from the moves — written to the PGN as the ECO and Opening tags"
            className={READ_ONLY_CLASS}
          />
        </Field>
        {annotator && (
          <Field name="Annotator">
            <input
              type="text"
              aria-label="Annotator"
              readOnly
              value={annotator}
              title="Written by this app on every conversion"
              className={READ_ONLY_CLASS}
            />
          </Field>
        )}
      </div>

      {missing.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-rule pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
              Add a tag
            </span>
            {/* Choosing is the whole action — there is nothing to confirm. The
                value stays empty, so the box goes back to its prompt and the
                tag just chosen is gone from the list, being carried now. */}
            <select
              value=""
              onChange={(e) => onAdd(e.target.value)}
              aria-label="Tag to add"
              className="w-56 rounded-md border border-rule bg-card px-2.5 py-1.5 text-sm"
            >
              <option value="">Choose a tag…</option>
              {missing.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <p className="basis-full text-xs text-ink-mute">
            Only tags the game does not already carry are listed. A tag added here starts empty
            and goes into the converted PGN as soon as you fill it in; the bin beside a tag's
            name takes it back out, and it returns to this list.
          </p>
        </div>
      )}
    </div>
  )
}
