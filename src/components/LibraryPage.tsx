import { useCallback, useEffect, useState } from 'react'
import { clearSession, loadSession, saveSession, signIn } from '../lib/lichess/oauth'
import type { LichessSession } from '../lib/lichess/oauth'
import { fetchAccount, LichessApiError, streamStudies } from '../lib/lichess/studies'
import type { StudyMetadata } from '../lib/lichess/studies'
import { LibraryClient } from '../lib/lichess/library'
import {
  forgetCachedStudy,
  loadCachedStudies,
  parseStudy,
  requestPersistence,
  saveCachedStudy,
  staleStudyIds,
  vanishedStudyIds,
} from '../lib/gameLibrary'
import type { CachedStudy, LibraryGame } from '../lib/gameLibrary'
import LichessStudyPicker from './LichessStudyPicker'

export type SaveState =
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | null

interface LibraryPageProps {
  client: LibraryClient
  /** The chapter currently loaded, so the list can say which one it is. */
  openChapterId: string | null
  onOpen: (game: LibraryGame, studyId: string) => void
  /** The loaded game's name, or null when there is nothing to save. */
  gameName: string | null
  /** True when the loaded game came from a chapter this session opened. */
  canUpdate: boolean
  onSave: (mode: 'update' | 'new', studyId: string) => void
  saveState: SaveState
}

const BUTTON =
  'rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40'
const PRIMARY =
  'rounded-lg bg-felt px-4 py-1.5 text-sm font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40'

/**
 * The library: the user's Lichess studies as folders of games.
 *
 * Studies are listed from Lichess every visit, because that listing is one
 * cheap call and is the only thing that can say a study has changed — or gone,
 * which happens whenever one is deleted on lichess.org, since the API has no
 * delete for this app to have done it itself. The games inside are read from
 * the local cache and downloaded only when that listing says the copy is out
 * of date.
 */
export default function LibraryPage({
  client,
  openChapterId,
  onOpen,
  gameName,
  canUpdate,
  onSave,
  saveState,
}: LibraryPageProps) {
  const [session, setSession] = useState<LichessSession | null>(() => loadSession())
  const [studies, setStudies] = useState<StudyMetadata[]>([])
  const [streaming, setStreaming] = useState(false)
  const [listed, setListed] = useState(false)
  const [studyId, setStudyId] = useState('')
  const [cache, setCache] = useState<Map<string, CachedStudy>>(new Map())
  const [loadingGames, setLoadingGames] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFailure = useCallback((e: unknown) => {
    // A rejected token is worth nothing. Dropping it here is what stops a dead
    // session being re-loaded and re-spent on every visit to this page.
    if (e instanceof LichessApiError && e.unauthorized) {
      clearSession()
      setSession(null)
    }
    setError(e instanceof Error ? e.message : String(e))
  }, [])

  // The cache outlives the session, so it is read before anything is asked of
  // Lichess: a signed-out visit still shows what was there last time.
  useEffect(() => {
    let live = true
    void requestPersistence()
    void loadCachedStudies().then((cached) => {
      if (live) setCache(new Map(cached.map((study) => [study.id, study])))
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!session || listed) return
    const controller = new AbortController()
    let live = true
    setStreaming(true)
    setStudies([])

    streamStudies(
      session.token,
      session.username,
      (batch) => {
        if (!live) return
        setStudies((current) => [...current, ...batch])
      },
      controller.signal,
    )
      .then(() => {
        if (live) setListed(true)
      })
      .catch((e) => {
        if (!live || controller.signal.aborted) return
        setListed(true)
        handleFailure(e)
      })
      .finally(() => {
        if (live) setStreaming(false)
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [session, listed, handleFailure])

  /**
   * Drop cached studies the listing no longer mentions.
   *
   * Only once the stream has finished: a partial listing would read as every
   * study yet to arrive having been deleted.
   */
  useEffect(() => {
    if (!listed || studies.length === 0) return
    const gone = vanishedStudyIds(studies, [...cache.values()])
    if (gone.length === 0) return
    for (const id of gone) void forgetCachedStudy(id)
    setCache((current) => {
      const next = new Map(current)
      for (const id of gone) next.delete(id)
      return next
    })
  }, [listed, studies, cache])

  const selected = studyId ? (cache.get(studyId) ?? null) : null
  const meta = studies.find((study) => study.id === studyId) ?? null

  // Download the chosen study when there is no copy, or Lichess says the copy
  // is behind. An unchanged study costs nothing at all.
  useEffect(() => {
    if (!session || !meta) return
    if (staleStudyIds([meta], selected ? [selected] : []).length === 0) return

    let live = true
    setLoadingGames(true)
    client
      .fetchStudy(session.token, meta.id)
      .then((pgn) => {
        if (!live) return
        const study = parseStudy(meta, pgn, Date.now())
        void saveCachedStudy(study)
        setCache((current) => new Map(current).set(study.id, study))
      })
      .catch((e) => {
        if (live) handleFailure(e)
      })
      .finally(() => {
        if (live) setLoadingGames(false)
      })

    return () => {
      live = false
    }
  }, [session, meta, selected, client, handleFailure])

  const handleSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      const { token, expiresAt } = await signIn()
      const { username } = await fetchAccount(token)
      saveSession({ token, expiresAt, username })
      setSession({ token, expiresAt, username })
      setListed(false)
    } catch (e) {
      handleFailure(e)
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-xl border border-rule bg-card p-6 text-center shadow-sm">
          <h2 className="font-display text-lg font-semibold">Your game library</h2>
          <p className="mt-2 text-sm text-ink-mute">
            Games live in your own Lichess studies — a study is a folder, a chapter is a game.
            Nothing is stored on this site, and signing in is what gives the library something to
            read.
          </p>
          {error && <p className="mt-3 text-sm text-rose">{error}</p>}
          <button type="button" className={`${PRIMARY} mt-4`} disabled={busy} onClick={handleSignIn}>
            {busy ? 'Signing in…' : 'Sign in with Lichess'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          Library <span className="text-sm font-normal text-ink-mute">— {session.username}</span>
        </h2>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setListed(false)
            setError(null)
          }}
          disabled={streaming}
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rule bg-card px-3 py-2 text-sm text-rose">{error}</p>
      )}

      {gameName && (
        <SaveBar
          gameName={gameName}
          canUpdate={canUpdate}
          studyName={meta?.name ?? null}
          state={saveState}
          onSave={(mode) => onSave(mode, studyId)}
        />
      )}

      <LichessStudyPicker
        studies={studies}
        loading={streaming}
        selectedId={studyId}
        onSelect={setStudyId}
      />

      <GameList
        study={selected}
        loading={loadingGames}
        studyChosen={!!meta}
        openChapterId={openChapterId}
        onOpen={(game) => meta && onOpen(game, meta.id)}
      />
    </div>
  )
}

/**
 * Saving the loaded game, with the two ways of doing it kept apart.
 *
 * Update writes over the chapter this session opened; anything else adds a new
 * chapter, because the API has no version to check and an overwrite of a
 * chapter we did not load could be over somebody else's work — or over the
 * user's own, edited in another tab.
 */
function SaveBar({
  gameName,
  canUpdate,
  studyName,
  state,
  onSave,
}: {
  gameName: string
  canUpdate: boolean
  studyName: string | null
  state: SaveState
  onSave: (mode: 'update' | 'new') => void
}) {
  const saving = state?.kind === 'saving'
  return (
    <div className="rounded-xl border border-rule bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="text-ink-mute">Loaded: </span>
          {gameName}
        </span>
        {canUpdate && (
          <button
            type="button"
            className={BUTTON}
            disabled={saving}
            onClick={() => onSave('update')}
          >
            {saving ? 'Saving…' : 'Update this chapter'}
          </button>
        )}
        <button
          type="button"
          className={PRIMARY}
          disabled={saving || !studyName}
          title={studyName ? undefined : 'Choose a study first'}
          onClick={() => onSave('new')}
        >
          {studyName ? `Add to ${studyName}` : 'Add to study'}
        </button>
      </div>
      {state?.kind === 'error' && <p className="mt-2 text-sm text-rose">{state.message}</p>}
      {state?.kind === 'saved' && <p className="mt-2 text-sm text-ink-mute">Saved to Lichess.</p>}
    </div>
  )
}

function GameList({
  study,
  loading,
  studyChosen,
  openChapterId,
  onOpen,
}: {
  study: CachedStudy | null
  loading: boolean
  studyChosen: boolean
  openChapterId: string | null
  onOpen: (game: LibraryGame) => void
}) {
  if (!studyChosen) {
    return <p className="text-sm text-ink-mute">Choose a study to see the games in it.</p>
  }
  if (loading && !study) {
    return <p className="text-sm text-ink-mute">Downloading games…</p>
  }
  if (!study || study.games.length === 0) {
    return <p className="text-sm text-ink-mute">No games in this study yet.</p>
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-rule bg-card shadow-sm">
      <ul className="divide-y divide-rule">
        {study.games.map((game, i) => {
          const current = game.chapterId != null && game.chapterId === openChapterId
          return (
            <li key={game.chapterId ?? `game-${i}`}>
              <button
                type="button"
                onClick={() => onOpen(game)}
                className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors hover:bg-buff-soft ${
                  current ? 'bg-buff-soft' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {game.chapterName ?? nameOf(game)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-mute">{game.result}</span>
                <span className="w-24 shrink-0 truncate text-right text-xs text-ink-mute">
                  {game.date}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A fallback title for a chapter whose name Lichess did not send. */
function nameOf(game: LibraryGame): string {
  if (game.white || game.black) return `${game.white ?? '?'} – ${game.black ?? '?'}`
  return game.event ?? 'Untitled game'
}
