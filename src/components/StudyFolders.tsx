import { useEffect, useRef, useState } from 'react'
import { cleanFolderName, FOLDER_NAME_MAX, foldersOf } from '../lib/folders'
import type { FolderFilter, FolderMap } from '../lib/folders'
import type { StudyVisibility } from '../lib/lichess/library'

const CHIP =
  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
const CHOSEN = 'border-felt-bright bg-felt/10'
const PLAIN = 'border-rule hover:bg-buff-soft'

function sameFilter(a: FolderFilter, b: FolderFilter): boolean {
  return a.kind === b.kind && (a.kind !== 'named' || b.kind !== 'named' || a.name === b.name)
}

/**
 * The folder bar over the study picker.
 *
 * Folders are this app's own idea — Lichess has nowhere to keep one — so the
 * bar is a filter over the studies the listing returned rather than a structure
 * anything else knows about. Unfiled is offered only when something is actually
 * unfiled, so a reader who has never made a folder sees no machinery at all.
 */
export function FolderBar({
  folders,
  filter,
  onFilter,
  unfiledCount,
  countOf,
}: {
  folders: FolderMap
  filter: FolderFilter
  onFilter: (filter: FolderFilter) => void
  unfiledCount: number
  countOf: (folder: string) => number
}) {
  const names = foldersOf(folders)
  if (names.length === 0) return null

  const chip = (f: FolderFilter, label: string, count: number) => (
    <li key={`${f.kind}:${f.kind === 'named' ? f.name : ''}`}>
      <button
        type="button"
        onClick={() => onFilter(f)}
        className={`${CHIP} ${sameFilter(filter, f) ? CHOSEN : PLAIN}`}
      >
        {label} <span className="text-ink-mute">{count}</span>
      </button>
    </li>
  )

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      <li className="mr-0.5 text-xs text-ink-mute">Folders:</li>
      {chip({ kind: 'all' }, 'All', unfiledCount + names.reduce((n, f) => n + countOf(f), 0))}
      {names.map((name) => chip({ kind: 'named', name }, name, countOf(name)))}
      {unfiledCount > 0 && chip({ kind: 'unfiled' }, 'Unfiled', unfiledCount)}
    </ul>
  )
}

/**
 * Where the selected study is filed, and the way to move it.
 *
 * A datalist rather than a select: the folders that exist are worth offering,
 * but making a new one should not be a separate act from filing something in
 * it — the first study in a folder is how every folder starts.
 */
export function FolderPicker({
  folders,
  studyId,
  onAssign,
}: {
  folders: FolderMap
  studyId: string
  onAssign: (folder: string | null) => void
}) {
  const current = folders[studyId] ?? ''
  const [draft, setDraft] = useState(current)

  // Follows the selection: the box describes whichever study is chosen, and a
  // half-typed name for the last one has nothing to do with this one.
  useEffect(() => setDraft(current), [current, studyId])

  const commit = () => {
    const cleaned = cleanFolderName(draft)
    if (draft.trim() === '') onAssign(null)
    else if (cleaned && cleaned !== current) onAssign(cleaned)
    else setDraft(current)
  }

  return (
    <label className="flex items-center gap-2 text-xs text-ink-mute">
      Folder
      <input
        list="chesspique-folders"
        value={draft}
        maxLength={FOLDER_NAME_MAX}
        placeholder="Unfiled"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(current)
        }}
        className="w-40 rounded-md border border-rule bg-card px-2 py-1 text-xs text-ink"
      />
      <datalist id="chesspique-folders">
        {foldersOf(folders).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  )
}

/**
 * Make a study on Lichess.
 *
 * Visibility is decided here and can never be read back — the listing carries
 * only a name and two dates — so the choice is explained at the point it is
 * made rather than left to be discovered later. Private is the default: a
 * library of your own games is not a thing to publish by accident.
 */
export function NewStudyDialog({
  busy,
  error,
  folder,
  onCreate,
  onClose,
}: {
  busy: boolean
  error: string | null
  /** The folder it will be filed in, when the bar is showing one. */
  folder: string | null
  onCreate: (name: string, visibility: StudyVisibility) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<StudyVisibility>('private')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = name.trim().length >= 2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-label="New study"
        className="w-full max-w-md rounded-xl border border-rule bg-card p-5 shadow-lg"
      >
        <h3 className="font-display text-lg font-semibold">New study</h3>
        <p className="mt-1 text-xs text-ink-mute">
          Created on Lichess, in your account. A study is a folder of games and holds up to 64 of
          them.
        </p>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block text-xs text-ink-mute">Name</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && !busy) onCreate(name.trim(), visibility)
            }}
            placeholder="My games"
            className="w-full rounded-md border border-rule bg-card px-3 py-1.5"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="mb-1 text-xs text-ink-mute">Who can see it</legend>
          <div className="space-y-1.5">
            {(
              [
                ['private', 'Private', 'Only you. Share links from this app still work.'],
                ['unlisted', 'Unlisted', 'Anyone with the Lichess link, and off the public lists.'],
                ['public', 'Public', 'Listed on Lichess for anyone to find.'],
              ] as Array<[StudyVisibility, string, string]>
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-ink-mute">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {folder && (
          <p className="mt-3 text-xs text-ink-mute">
            It will be filed under <span className="font-medium text-ink">{folder}</span>.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-rose">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onCreate(name.trim(), visibility)}
            className="rounded-lg bg-felt px-4 py-1.5 text-sm font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create study'}
          </button>
        </div>
      </div>
    </div>
  )
}
