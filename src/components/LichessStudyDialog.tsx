import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSession, loadSession, saveSession, signIn, signOut } from '../lib/lichess/oauth'
import type { LichessSession } from '../lib/lichess/oauth'
import { fetchAccount, importPgn, LichessApiError, streamStudies } from '../lib/lichess/studies'
import type { ImportedChapter, StudyMetadata } from '../lib/lichess/studies'
import LichessStudyPicker from './LichessStudyPicker'

interface LichessStudyDialogProps {
  pgn: string
  /** Default chapter name — the players, as the rest of the app names the game. */
  defaultChapterName: string
  /** Why sign-in has not happened yet, when the opener's attempt failed. */
  initialError: string | null
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
  initialError,
  onClose,
}: LichessStudyDialogProps) {
  const [session, setSession] = useState<LichessSession | null>(() => loadSession())
  const [studies, setStudies] = useState<StudyMetadata[]>([])
  const [streaming, setStreaming] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [studyId, setStudyId] = useState('')
  const [chapterName, setChapterName] = useState(defaultChapterName)
  const [busy, setBusy] = useState<'signin' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(initialError)
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
    }
    setError(e instanceof Error ? e.message : String(e))
  }, [])

  /**
   * Read the study stream, showing each batch as it lands.
   *
   * Arrivals are appended rather than replacing the list, so what is on screen
   * only ever grows while the stream runs.
   */
  useEffect(() => {
    if (!session || loaded) return
    const controller = new AbortController()
    let live = true
    setStreaming(true)
    setStudies([])

    streamStudies(
      session.token,
      session.username,
      (batch) => {
        if (!live) return
        setStudies((current) => {
          const next = [...current, ...batch]
          // Pre-select the first study to arrive, so the common case needs no
          // choice at all; a later arrival never moves the selection.
          setStudyId((chosen) => chosen || next[0]?.id || '')
          return next
        })
      },
      controller.signal,
    )
      .then(() => {
        if (live) setLoaded(true)
      })
      .catch((e) => {
        if (!live || controller.signal.aborted) return
        setLoaded(true)
        handleFailure(e)
      })
      .finally(() => {
        if (live) setStreaming(false)
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [session, loaded, handleFailure])

  const handleSignIn = async () => {
    setBusy('signin')
    setError(null)
    try {
      const { token, expiresAt } = await signIn()
      const { username } = await fetchAccount(token)
      const next = { token, expiresAt, username }
      saveSession(next)
      setSession(next)
      setLoaded(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const handleSignOut = async () => {
    if (session) await signOut(session.token)
    setSession(null)
    setStudies([])
    setLoaded(false)
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

  const study = studies.find((s) => s.id === studyId)

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
        className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-rule bg-card text-ink shadow-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-3">
          <div>
            <h2 id="lichess-study-title" className="font-display text-lg font-semibold">
              Save to a Lichess study
            </h2>
            <p className="mt-0.5 text-xs text-ink-mute">
              {session
                ? `Signed in as ${session.username}`
                : busy === 'signin'
                  ? 'Signing in to Lichess…'
                  : 'Not signed in to Lichess'}
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

        {!session && (
          <div className="space-y-4 px-6 py-5 text-sm">
            {busy === 'signin' ? (
              <p className="text-ink-mute">A Lichess window has opened — finish signing in there.</p>
            ) : (
              // This dialog only shows signed out when an attempt failed. A
              // press here is a fresh gesture, and signIn opens its window
              // before it awaits anything, so this one is never blocked.
              <button type="button" onClick={() => void handleSignIn()} className={PRIMARY}>
                Try signing in again
              </button>
            )}
          </div>
        )}

        {session && !imported && (
          <LichessStudyPicker
            studies={studies}
            loading={streaming}
            selectedId={studyId}
            onSelect={setStudyId}
          />
        )}

        {session && imported && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5 text-sm">
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

        {session && !imported && (
          <div className="shrink-0 border-t border-rule px-6 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-mute">
                  Chapter name
                </span>
                <input
                  type="text"
                  value={chapterName}
                  maxLength={100}
                  onChange={(e) => setChapterName(e.target.value)}
                  className="w-full rounded-md border border-rule bg-buff-soft/50 px-3 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={busy != null || !studyId}
                className={PRIMARY}
                title={study ? `Add a chapter to ${study.name}` : undefined}
              >
                {busy === 'import' ? 'Sending…' : 'Add chapter'}
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={busy != null}
                className={BUTTON}
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="shrink-0 border-t border-rule px-6 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
