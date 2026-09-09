import { useEffect, useRef, useState } from 'react'
import { cleanFolderName, countIn, FOLDER_NAME_MAX, foldersOf } from '../lib/folders'
import type { FolderFilter, Folders } from '../lib/folders'
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
 * Always shown, even with no folders. It was hidden until one existed, on the
 * theory that a reader who never files anything should see no machinery — but
 * that also meant nobody could discover that folders are what group studies,
 * because the only trace of the feature appeared after you had already used it.
 * Empty, it is one line saying what folders are for and offering to make one.
 *
 * A named folder brings its own management with it: rename and delete are here,
 * beside the thing they act on, rather than behind a settings page for a
 * feature this small.
 */
export function FolderBar({
  folders,
  filter,
  onFilter,
  ids,
  onCreate,
  onRename,
  onRemove,
}: {
  folders: Folders
  filter: FolderFilter
  onFilter: (filter: FolderFilter) => void
  /** The studies the listing returned, for the counts. */
  ids: string[]
  onCreate: (name: string) => void
  onRename: (from: string, to: string) => void
  onRemove: (name: string) => void
}) {
  const [making, setMaking] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const names = foldersOf(folders)
  const unfiled = ids.filter((id) => !(id in folders.of)).length

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

  const commitNew = () => {
    const cleaned = cleanFolderName(draft)
    if (cleaned) {
      onCreate(cleaned)
      onFilter({ kind: 'named', name: cleaned })
    }
    setDraft('')
    setMaking(false)
  }

  return (
    <div className="rounded-xl border border-rule bg-card px-3 py-2 shadow-sm">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li className="mr-0.5 text-xs font-medium">
          Folders
          <span className="ml-1 font-normal text-ink-mute">— your own grouping of these studies</span>
        </li>
        {names.length > 0 && chip({ kind: 'all' }, 'All', ids.length)}
        {names.map((name) => chip({ kind: 'named', name }, name, countIn(folders, name, ids)))}
        {names.length > 0 && unfiled > 0 && chip({ kind: 'unfiled' }, 'Unfiled', unfiled)}

        <li>
          {making ? (
            <input
              autoFocus
              value={draft}
              maxLength={FOLDER_NAME_MAX}
              placeholder="Folder name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitNew}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setDraft('')
                  setMaking(false)
                }
              }}
              className="w-36 rounded-lg border border-rule bg-card px-2 py-1 text-xs"
            />
          ) : (
            <button type="button" onClick={() => setMaking(true)} className={`${CHIP} ${PLAIN}`}>
              + New folder
            </button>
          )}
        </li>
      </ul>

      {/* Only for a named folder: All and Unfiled are not things that can be
          renamed or deleted, and offering it would say otherwise. */}
      {filter.kind === 'named' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rule pt-2">
          {renaming === filter.name ? (
            <input
              autoFocus
              defaultValue={filter.name}
              maxLength={FOLDER_NAME_MAX}
              onBlur={(e) => {
                const cleaned = cleanFolderName(e.target.value)
                if (cleaned && cleaned !== filter.name) {
                  onRename(filter.name, cleaned)
                  onFilter({ kind: 'named', name: cleaned })
                }
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="w-44 rounded-md border border-rule bg-card px-2 py-1 text-xs"
            />
          ) : (
            <>
              <span className="text-xs text-ink-mute">
                {countIn(folders, filter.name, ids)}{' '}
                {countIn(folders, filter.name, ids) === 1 ? 'study' : 'studies'} in{' '}
                <b className="text-ink">{filter.name}</b>
              </span>
              <button type="button" onClick={() => setRenaming(filter.name)} className={`${CHIP} ${PLAIN}`}>
                Rename
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(filter.name)}
                className={`${CHIP} ${PLAIN}`}
              >
                Delete folder
              </button>
            </>
          )}
        </div>
      )}

      {confirmRemove && (
        <div className="mt-2 rounded-lg border border-rule bg-buff-soft/40 px-3 py-2">
          <p className="text-xs">
            Delete <b>{confirmRemove}</b>?{' '}
            {countIn(folders, confirmRemove, ids) === 1
              ? 'The one study in it becomes'
              : `The ${countIn(folders, confirmRemove, ids)} studies in it become`}{' '}
            unfiled. Nothing on Lichess is touched — this folder only exists in this browser.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onRemove(confirmRemove)
                onFilter({ kind: 'all' })
                setConfirmRemove(null)
              }}
              className={`${CHIP} border-felt bg-felt text-buff hover:bg-felt-deep`}
            >
              Delete folder
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              className={`${CHIP} ${PLAIN}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
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
  folders: Folders
  studyId: string
  onAssign: (folder: string | null) => void
}) {
  const current = folders.of[studyId] ?? ''
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
      In folder
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
