import { useRef, useState } from 'react'
import {
  applyBackup,
  BACKED_UP_KEYS,
  backupFileName,
  BackupError,
  buildBackup,
  describeBackup,
  parseBackup,
  serializeBackup,
} from '../lib/backup'
import type { Backup } from '../lib/backup'

const BUTTON =
  'rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40'
const PRIMARY =
  'rounded-lg bg-felt px-4 py-1.5 text-sm font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep'

/**
 * Saving and restoring what only this browser knows.
 *
 * Which is a short list, and the copy says so rather than implying the games
 * are in here: they are in Lichess studies, their tags are inside their PGNs,
 * and the study cache rebuilds itself. Overstating what a backup holds is how
 * somebody ends up trusting one for something it never carried.
 *
 * Restoring asks first, because it overwrites settings and folders that may
 * have moved on since the file was written, and reloads afterwards — the
 * settings are read into React state at startup, so a restore that did not
 * reload would leave the screen disagreeing with the storage behind it.
 */
export default function BackupSettings() {
  const [pending, setPending] = useState<Backup | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    const now = new Date()
    const text = serializeBackup(buildBackup((key) => localStorage.getItem(key), now))
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(now)
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ kind: 'ok', text: 'Backup saved.' })
  }

  const read = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        setPending(parseBackup(String(reader.result ?? '')))
        setMessage(null)
      } catch (e) {
        setPending(null)
        setMessage({
          kind: 'bad',
          text: e instanceof BackupError ? e.message : 'That file could not be read.',
        })
      }
    }
    reader.readAsText(file)
  }

  const restore = () => {
    if (!pending) return
    const result = applyBackup(pending, (key, value) => localStorage.setItem(key, value))
    setPending(null)
    if (result.restored.length === 0) {
      setMessage({ kind: 'bad', text: 'That backup held nothing this version can restore.' })
      return
    }
    // Reloading rather than telling the reader to: everything here is read at
    // startup, and a restore that left the screen showing the old values would
    // look like it had not worked.
    window.location.reload()
  }

  return (
    <section className="rounded-xl border border-rule bg-card p-5 shadow-sm">
      <h3 className="font-display text-base font-semibold">Backup</h3>
      <p className="mt-0.5 text-xs text-ink-mute">
        Your folders, your recent lists and these settings live in this browser and nowhere else. A
        backup is the copy that survives clearing it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={PRIMARY} onClick={save}>
          Save a backup
        </button>
        <button type="button" className={BUTTON} onClick={() => fileRef.current?.click()}>
          Restore from a file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) read(file)
            e.target.value = ''
          }}
        />
      </div>

      {pending && (
        <div className="mt-3 rounded-lg border border-rule bg-buff-soft/40 px-3 py-2">
          <p className="text-sm">
            Restore {describeBackup(pending)}
            {pending.savedAt && ` from ${new Date(pending.savedAt).toLocaleString()}`}?
          </p>
          <p className="mt-1 text-xs text-ink-mute">
            This replaces what is in this browser now. Your games are not affected — they are in
            your Lichess studies.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={PRIMARY} onClick={restore}>
              Restore and reload
            </button>
            <button type="button" className={BUTTON} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'bad' ? 'text-rose' : 'text-ink-mute'}`}>
          {message.text}
        </p>
      )}

      {/* Said plainly, because the alternative is somebody trusting a backup
          for something it never held. */}
      <p className="mt-4 text-xs text-ink-mute">
        A backup holds {BACKED_UP_KEYS.length} things: your appearance, engine and explorer
        settings, your folders, and your two recent lists. It does <b>not</b> hold your games —
        those are chapters in your Lichess studies — or your Lichess sign-in, which is deliberately
        left out so that a backup file is never worth stealing.
      </p>
    </section>
  )
}
