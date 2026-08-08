import { useState } from 'react'
import { STANDARD_TAGS } from '../lib/convert'
import type { Opening } from '../lib/openings'

interface TagEditorProps {
  headers: Array<{ name: string; value: string }>
  onChange: (index: number, value: string) => void
  /** Add a tag the game does not carry yet, with an empty value. */
  onAdd: (name: string) => void
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

function Field({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
        {name}
      </span>
      {children}
    </label>
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
  generated,
  opening,
}: TagEditorProps) {
  const [adding, setAdding] = useState('')

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
            <Field key={`${header.name}-${index}`} name={header.name}>
              <input
                type="text"
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
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
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
          <button
            type="button"
            disabled={adding === ''}
            onClick={() => {
              onAdd(adding)
              setAdding('')
            }}
            className="rounded-md bg-felt px-4 py-1.5 text-sm font-medium text-buff transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <p className="basis-full text-xs text-ink-mute">
            Only tags the game does not already carry are listed. A tag added here starts empty
            and goes into the converted PGN as soon as you fill it in.
          </p>
        </div>
      )}
    </div>
  )
}
