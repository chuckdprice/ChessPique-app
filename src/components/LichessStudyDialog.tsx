import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearSession,
  loadSession,
  saveSession,
  signIn,
  signOut,
  SCOPES,
} from '../lib/lichess/oauth'
import type { LichessSession } from '../lib/lichess/oauth'
import { fetchAccount, fetchStudies, importPgn, LichessApiError } from '../lib/lichess/studies'
import type { ImportedChapter, StudyMetadata } from '../lib/lichess/studies'

interface LichessStudyDialogProps {
  pgn: string
  /** Default chapter name — the players, as the rest of the app names the game. */
  defaultChapterName: string
  onClose: () => void
}

const BUTTON =
  'rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40'
const PRIMARY =
  'rounded-lg bg-felt px-4 py-1.5 text-sm font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Sign in to Lichess and put the converted game into one of the user's studies.
 *
 * The whole exchange is between the browser and Lichess: this app has no server
 * to route a game through, and the token never leaves the machine it was
 * granted on.
 */
export default function LichessStudyDialog({
  pgn,
  defaultChapterName,
  onClose,
}: LichessStudyDialogProps) {
  const [session, setSession] = useState<LichessSession | null>(() => loadSession())
  const [studies, setStudies] = useState<StudyMetadata[] | null>(null)
  const [studyId, setStudyId] = useState('')
  const [chapterName, setChapterName] = useState(defaultChapterName)
  const [busy, setBusy] = useState<'signin' | 'studies' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<ImportedChapter[] | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** A rejected token is worth nothing; drop it and offer to sign in again. */
  const handleFailure = useCallback((e: unknown) => {
    if (e instanceof LichessApiError && e.unauthorized) {
      clearSession()
      setSession(null)
      setStudies(null)
    }
    setError(e instanceof Error ? e.message : String(e))
  }, [])

  const loadStudies = useCallback(
    async (active: LichessSession) => {
      setBusy('studies')
      setError(null)
      try {
        const list = await fetchStudies(active.token, active.username)
        setStudies(list)
        setStudyId((current) => current || (list[0]?.id ?? ''))
      } catch (e) {
        handleFailure(e)
      } finally {
        setBusy(null)
      }
    },
    [handleFailure],
  )

  // Studies are fetched once per session, and again after signing in.
  useEffect(() => {
    if (session && studies == null && busy == null) void loadStudies(session)
  }, [session, studies, busy, loadStudies])

  const handleSignIn = async () => {
    setBusy('signin')
    setError(null)
    try {
      const { token, expiresAt } = await signIn()
      const { username } = await fetchAccount(token)
      const next = { token, expiresAt, username }
      saveSession(next)
      setSession(next)
      setStudies(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const handleSignOut = async () => {
    if (session) await signOut(session.token)
    setSession(null)
    setStudies(null)
    setStudyId('')
    setImported(null)
  }

  const handleImport = async () => {
    if (!session || !studyId) return
    setBusy('import')
    setError(null)
    try {
      const chapters = await importPgn(session.token, studyId, {
        pgn,
        name: chapterName.trim() || defaultChapterName,
      })
      setImported(chapters)
    } catch (e) {
      handleFailure(e)
    } finally {
      setBusy(null)
    }
  }

  const study = studies?.find((s) => s.id === studyId)

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lichess-study-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-rule bg-card text-ink shadow-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 id="lichess-study-title" className="font-display text-lg font-semibold">
              Save to a Lichess study
            </h2>
            <p className="mt-0.5 text-xs text-ink-mute">
              {session ? `Signed in as ${session.username}` : 'Sign in to Lichess to continue'}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${BUTTON} shrink-0`}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          {!session && (
            <>
              <p className="text-ink-mute">
                This sends the converted game straight from your browser to Lichess. The app has
                no server, so nothing passes through anywhere else.
              </p>
              <p className="text-ink-mute">
                Lichess will ask you to grant <span className="font-score text-ink">{SCOPES}</span>{' '}
                — reading your studies to list them, and writing to add a chapter. Nothing else on
                your account is included.
              </p>
              <button type="button" onClick={handleSignIn} disabled={busy != null} className={PRIMARY}>
                {busy === 'signin' ? 'Waiting for Lichess…' : 'Sign in with Lichess'}
              </button>
            </>
          )}

          {session && !imported && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
                  Study
                </span>
                {busy === 'studies' ? (
                  <p className="text-ink-mute">Loading your studies…</p>
                ) : studies && studies.length > 0 ? (
                  <select
                    value={studyId}
                    onChange={(e) => setStudyId(e.target.value)}
                    className="w-full rounded-md border border-rule bg-card px-3 py-1.5"
                  >
                    {studies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-ink-mute">
                    No studies found on your account.{' '}
                    <a
                      href="https://lichess.org/study"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Create one on Lichess
                    </a>
                    , then reload the list.
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
                  Chapter name
                </span>
                <input
                  type="text"
                  value={chapterName}
                  maxLength={100}
                  onChange={(e) => setChapterName(e.target.value)}
                  className="w-full rounded-md border border-rule bg-buff-soft/50 px-3 py-1.5"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={busy != null || !studyId}
                  className={PRIMARY}
                >
                  {busy === 'import' ? 'Sending…' : 'Add chapter'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadStudies(session)}
                  disabled={busy != null}
                  className={BUTTON}
                >
                  Reload studies
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={busy != null}
                  className={`${BUTTON} ml-auto`}
                >
                  Sign out
                </button>
              </div>
            </>
          )}

          {imported && (
            <div className="space-y-3">
              <p>
                Added to <span className="font-medium">{study?.name ?? 'your study'}</span>.
              </p>
              <ul className="space-y-1">
                {imported.map((chapter) => (
                  <li key={chapter.id}>
                    <a
                      href={chapter.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      Open {chapter.name} on Lichess
                    </a>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setImported(null)} className={BUTTON}>
                Add another chapter
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-text">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
