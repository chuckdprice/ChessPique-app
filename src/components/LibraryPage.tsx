import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  loadRecentGames,
  loadRecentStudies,
  prunedStudies,
  saveRecentGames,
  saveRecentStudies,
  withoutGame,
  withoutStudies,
} from '../lib/recents'
import type { RecentGame, RecentStudy } from '../lib/recents'
import { gameOf } from '../lib/gameLibrary'
import { summarize } from '../lib/multiPgn'
import {
  assignFolder,
  filterIsStale,
  loadFolders,
  matchesFilter,
  pruneFolders,
  saveFolders,
} from '../lib/folders'
import type { FolderFilter, FolderMap } from '../lib/folders'
import { FolderBar, FolderPicker, NewStudyDialog } from './StudyFolders'
import type { StudyVisibility } from '../lib/lichess/library'

export type SaveState =
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | null

interface LibraryPageProps {
  client: LibraryClient
  /** The chapter currently loaded, so the list can say which one it is. */
  openChapterId: string | null
  onOpen: (game: LibraryGame, studyId: string, studyName: string) => void
  /** The loaded game's name, or null when there is nothing to save. */
  gameName: string | null
  /** True when the loaded game came from a chapter this session opened. */
  canUpdate: boolean
  onSave: (mode: 'update' | 'new', studyId: string, studyName: string) => void
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
  const [recentGames, setRecentGames] = useState<RecentGame[]>(loadRecentGames)
  const [recentStudies, setRecentStudies] = useState<RecentStudy[]>(loadRecentStudies)
  const [openingRecent, setOpeningRecent] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderMap>(loadFolders)
  const [filter, setFilter] = useState<FolderFilter>({ kind: 'all' })
  const [newStudyOpen, setNewStudyOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

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

  /**
   * Drop recents whose study the listing no longer has.
   *
   * A recent entry offering to open a game that is gone is worse than no entry
   * at all, and a study's absence from a finished listing is the only notice
   * this app ever gets. A single chapter deleted inside a study that still
   * exists cannot be caught here — that one is found on the click, below.
   */
  useEffect(() => {
    if (!listed) return
    const live = studies.map((s) => s.id)
    setRecentGames((current) => {
      const next = withoutStudies(current, current.map((g) => g.studyId).filter((id) => !live.includes(id)))
      if (next.length === current.length) return current
      saveRecentGames(next)
      return next
    })
    setRecentStudies((current) => {
      const next = prunedStudies(current, live)
      if (next.length === current.length) return current
      saveRecentStudies(next)
      return next
    })
  }, [listed, studies])

  /**
   * Drop folder entries for studies the listing no longer has.
   *
   * The same notice-by-absence everything else here relies on. Kept apart from
   * the recents pruning because the two lists are unrelated: a study can leave
   * one without touching the other.
   */
  useEffect(() => {
    if (!listed) return
    const live = studies.map((s) => s.id)
    setFolders((current) => {
      const next = pruneFolders(current, live)
      if (Object.keys(next).length === Object.keys(current).length) return current
      saveFolders(next)
      return next
    })
  }, [listed, studies])

  // A folder is exactly the studies naming it, so emptying one deletes it —
  // and the bar would then sit on a name nothing matches, showing an empty
  // list with no way to tell why.
  useEffect(() => {
    if (filterIsStale(folders, filter)) setFilter({ kind: 'all' })
  }, [folders, filter])

  /**
   * Re-read the lists after App has written to them.
   *
   * They are recorded where the opening and saving happen, which is App, and
   * displayed here; rather than lifting the state up for two lists that are
   * only ever read in one place, this watches the two props that change when
   * something has just been recorded.
   */
  useEffect(() => {
    setRecentGames(loadRecentGames())
    setRecentStudies(loadRecentStudies())
  }, [openChapterId, saveState])

  const selected = studyId ? (cache.get(studyId) ?? null) : null
  const meta = studies.find((study) => study.id === studyId) ?? null
  // The picker is handed a filtered list rather than taught about folders: it
  // already knows how to show a list of studies, and folders are this app's
  // idea rather than anything Lichess would tell it about.
  const shown = studies.filter((study) => matchesFilter(folders, study.id, filter))
  const countIn = (folder: string) =>
    studies.filter((study) => folders[study.id] === folder).length
  const unfiledCount = studies.filter((study) => !(study.id in folders)).length

  const setFolderOf = (id: string, folder: string | null) => {
    setFolders((current) => {
      const next = assignFolder(current, id, folder)
      saveFolders(next)
      return next
    })
  }

  /**
   * Make a study, and file it where the bar is pointing.
   *
   * Re-listing afterwards rather than adding it locally: the listing is what
   * every other part of this page trusts, and a study invented here that the
   * listing did not confirm would be a second source of truth.
   */
  const handleCreate = async (name: string, visibility: StudyVisibility) => {
    if (!session) return
    setCreating(true)
    setCreateError(null)
    try {
      const { id } = await client.createStudy(session.token, { name, visibility })
      if (filter.kind === 'named') setFolderOf(id, filter.name)
      setNewStudyOpen(false)
      setStudyId(id)
      setListed(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  /**
   * Download the chosen study when there is no copy, or Lichess says the copy
   * is behind. An unchanged study costs nothing at all.
   *
   * `fetched` records what has already been asked for, and it is deliberately
   * not cleared when the download lands. Refresh does two things — it drops the
   * open study's copy and re-lists — and each re-runs this effect, with a gap
   * where the listing has been blanked and `meta` is null. Cancelling on that
   * gap threw the first download away and started a second; clearing the guard
   * on completion was no better, because `selected` is React state and lags the
   * write, so a run in between saw a stale "not cached" and asked again.
   * Measured, one Refresh fetched the same study three times. A key that
   * survives the landing is the only version that answers all of it: nothing is
   * cancelled, a late arrival is still the study it was asked for, and a second
   * request for the same study at the same `updatedAt` never goes out.
   *
   * Refresh clears it, because "ask again for exactly this" is what Refresh is
   * for. A failure clears it too, so the next render may retry rather than
   * leaving the study unreachable until the page is reloaded.
   */
  const fetched = useRef<string | null>(null)

  useEffect(() => {
    if (!session || !meta) return
    if (staleStudyIds([meta], selected ? [selected] : []).length === 0) return

    const key = `${meta.id}@${meta.updatedAt}`
    if (fetched.current === key) return
    fetched.current = key
    setLoadingGames(true)

    client
      .fetchStudy(session.token, meta.id)
      .then((pgn) => {
        const study = parseStudy(meta, pgn, Date.now())
        void saveCachedStudy(study)
        setCache((current) => new Map(current).set(study.id, study))
      })
      .catch((e) => {
        if (fetched.current === key) fetched.current = null
        handleFailure(e)
      })
      .finally(() => setLoadingGames(false))
  }, [session, meta, selected, client, handleFailure])

  /**
   * Open a game straight from the recents list.
   *
   * The cached study is tried first, so the common case costs nothing; failing
   * that, one chapter is fetched rather than its whole study, because a recent
   * entry is a shortcut and downloading sixty-three other games to honour it
   * would not be one.
   *
   * A chapter that has been deleted inside a study that still exists is only
   * discoverable here, on the click. It is dropped from the list and said so
   * plainly rather than reported as a failure — the entry was a guess about
   * what is still there, and it was wrong.
   */
  const handleOpenRecent = async (entry: RecentGame) => {
    const key = `${entry.studyId}/${entry.chapterId}`
    const forget = () => {
      setRecentGames((current) => {
        const next = withoutGame(current, entry.studyId, entry.chapterId)
        saveRecentGames(next)
        return next
      })
    }

    const cached = gameOf(cache.get(entry.studyId) ?? null, entry.chapterId)
    if (cached) {
      onOpen(cached, entry.studyId, entry.studyName)
      return
    }
    if (!session) return

    setOpeningRecent(key)
    setError(null)
    try {
      const pgn = await client.fetchChapter(session.token, entry.studyId, entry.chapterId)
      const game: LibraryGame = { ...summarize(pgn), pgn }
      if (!game.chapterId) {
        forget()
        setError(`“${entry.chapterName}” is no longer in ${entry.studyName}.`)
        return
      }
      onOpen(game, entry.studyId, entry.studyName)
    } catch (e) {
      if (e instanceof LichessApiError && !e.unauthorized) {
        forget()
        setError(`“${entry.chapterName}” could not be opened, so it has left the list.`)
        return
      }
      handleFailure(e)
    } finally {
      setOpeningRecent(null)
    }
  }

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
        <h2 className="min-w-0 flex-1 font-display text-lg font-semibold">
          Library <span className="text-sm font-normal text-ink-mute">— {session.username}</span>
        </h2>
        <button type="button" className={BUTTON} onClick={() => setNewStudyOpen(true)}>
          New study…
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setListed(false)
            setError(null)
            // Drop the open study's copy rather than re-validating it.
            //
            // The automatic path compares Lichess's `updatedAt` against the
            // cached one, and that is right for noticing a study has moved on
            // — but it is not what Refresh means. Two reasons it would fail
            // here. Renaming a chapter reaches `updatedAt` through
            // `setStudyUpdated`, which lila debounces by five seconds
            // (StudyApi.scala), so coming straight back and pressing Refresh
            // can read a timestamp that has not caught up yet. And a reader
            // pressing Refresh is saying the copy on screen is wrong, whatever
            // any timestamp claims. Forgetting it makes the download
            // unconditional.
            if (studyId) {
              fetched.current = null
              void forgetCachedStudy(studyId)
              setCache((current) => {
                const next = new Map(current)
                next.delete(studyId)
                return next
              })
            }
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
          onSave={(mode) => onSave(mode, studyId, meta?.name ?? '')}
        />
      )}

      <Recents
        games={recentGames}
        studies={recentStudies}
        openingKey={openingRecent}
        openChapterId={openChapterId}
        onOpenGame={handleOpenRecent}
        onPickStudy={setStudyId}
      />

      <FolderBar
        folders={folders}
        filter={filter}
        onFilter={setFilter}
        unfiledCount={unfiledCount}
        countOf={countIn}
      />

      <LichessStudyPicker
        studies={shown}
        loading={streaming}
        selectedId={studyId}
        onSelect={setStudyId}
      />

      {meta && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-card px-3 py-2 shadow-sm">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{meta.name}</span>
          <FolderPicker
            folders={folders}
            studyId={meta.id}
            onAssign={(folder) => setFolderOf(meta.id, folder)}
          />
          {/* Out to Lichess, because there is no delete on the study API at
              all: POST /study/{id}/delete is the web route, cookie
              authenticated and without CORS, so a browser holding a Bearer
              token cannot reach it. Saying so is better than a button that
              could only ever fail. */}
          <a
            href={`https://lichess.org/study/${meta.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this study on Lichess, where it can be renamed or deleted"
            className="rounded-lg border border-rule px-2.5 py-1 text-xs font-medium transition-colors hover:bg-buff-soft"
          >
            Manage on Lichess
          </a>
        </div>
      )}

      {newStudyOpen && (
        <NewStudyDialog
          busy={creating}
          error={createError}
          folder={filter.kind === 'named' ? filter.name : null}
          onCreate={(name, visibility) => void handleCreate(name, visibility)}
          onClose={() => {
            setNewStudyOpen(false)
            setCreateError(null)
          }}
        />
      )}

      <GameList
        study={selected}
        loading={loadingGames}
        studyChosen={!!meta}
        openChapterId={openChapterId}
        onOpen={(game) => meta && onOpen(game, meta.id, meta.name)}
      />
    </div>
  )
}

/**
 * The way back to what you were working on.
 *
 * Both lists are shortcuts over what the cache already holds, so neither is
 * shown when it is empty — an empty shortcut is a row of chrome explaining that
 * it has nothing to offer. The studies are chips rather than a second list of
 * cards, because the picker below is already the list of studies and this is
 * only the short way into it.
 */
function Recents({
  games,
  studies,
  openingKey,
  openChapterId,
  onOpenGame,
  onPickStudy,
}: {
  games: RecentGame[]
  studies: RecentStudy[]
  /** "studyId/chapterId" of the entry being fetched, if any. */
  openingKey: string | null
  openChapterId: string | null
  onOpenGame: (entry: RecentGame) => void
  onPickStudy: (studyId: string) => void
}) {
  if (games.length === 0 && studies.length === 0) return null

  return (
    <div className="rounded-xl border border-rule bg-card p-3 shadow-sm">
      {games.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            Recent games
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {games.map((entry) => {
              const key = `${entry.studyId}/${entry.chapterId}`
              const current = entry.chapterId === openChapterId
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onOpenGame(entry)}
                    disabled={openingKey != null}
                    title={`${entry.chapterName} — ${entry.studyName}`}
                    className={`max-w-56 truncate rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                      current
                        ? 'border-felt-bright bg-felt/10 font-medium'
                        : 'border-rule hover:bg-buff-soft'
                    }`}
                  >
                    {openingKey === key ? 'Opening…' : entry.chapterName}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {studies.length > 0 && (
        <>
          <h3
            className={`text-xs font-semibold uppercase tracking-wide text-ink-mute ${
              games.length > 0 ? 'mt-3' : ''
            }`}
          >
            Recent studies
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {studies.map((entry) => (
              <li key={entry.studyId}>
                <button
                  type="button"
                  onClick={() => onPickStudy(entry.studyId)}
                  className="max-w-56 truncate rounded-lg border border-rule px-2.5 py-1 text-xs transition-colors hover:bg-buff-soft"
                >
                  {entry.studyName}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
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
