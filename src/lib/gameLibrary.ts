/**
 * The library's local copy of what lives in Lichess studies.
 *
 * A cache, never a master copy: everything here can be rebuilt by signing in
 * and downloading again, which is what keeps the backup problem small and what
 * makes it safe to throw the whole database away when anything looks wrong.
 *
 * It exists because there is no endpoint that lists a study's chapters. The
 * only way to learn what a study holds is to export all of it, so exporting it
 * once and remembering the result is the difference between opening a folder
 * costing one download and costing one per visit.
 *
 * `updatedAt` from `GET /api/study/by/{user}` is the validator. That listing is
 * one cheap ndjson call and says, for every study at once, whether the copy
 * here is still current.
 */

import { splitGames, summarize } from './multiPgn'
import type { StudyMetadata } from './lichess/studies'

/** One game as the picker shows it, plus the PGN it was read from. */
export interface LibraryGame {
  /** Null for a chapter with no ChapterURL tag, which should not happen. */
  chapterId: string | null
  chapterName: string | null
  white: string | null
  black: string | null
  date: string | null
  result: string | null
  event: string | null
  /** The game's own labels, read from its root comment. */
  tags: string[]
  /** The chapter's PGN exactly as Lichess served it. */
  pgn: string
}

export interface CachedStudy {
  id: string
  name: string
  /** Lichess's own last-modified, and the only thing that invalidates this. */
  updatedAt: number
  /** When this copy was taken, for showing the user how old it is. */
  fetchedAt: number
  games: LibraryGame[]
}

/**
 * Where the loaded game came from, and may be written back to.
 *
 * Only ever set for a study the signed-in user owns — a save to anyone else's
 * would be refused — and cleared whenever the loaded game becomes a different
 * game.
 */
export interface GameOrigin {
  studyId: string
  chapterId: string
  /**
   * The mainline as loaded, so a later version of this can ask Lichess whether
   * the chapter still holds what we started from before overwriting it.
   * Unused by the session rule, and carried so that check costs no migration.
   */
  loadedKey: string
  /**
   * The tags the chapter had when it was opened.
   *
   * The tags endpoint merges: it keeps every tag it is not told about, and
   * deletes one only when sent an empty value. So writing tags back needs to
   * know what was there before, or a tag the user removed quietly survives.
   */
  loadedTags: Array<{ name: string; value: string }>
}

/** A study export split into games, ready to cache. */
export function parseStudy(meta: StudyMetadata, pgn: string, fetchedAt: number): CachedStudy {
  return {
    id: meta.id,
    name: meta.name,
    updatedAt: meta.updatedAt,
    fetchedAt,
    games: splitGames(pgn).map((game) => ({ ...summarize(game), pgn: game })),
  }
}

/**
 * Which studies need downloading again: the ones never seen, and the ones
 * Lichess says have changed since this copy was taken.
 *
 * Compared with `!==` rather than `>`. A study whose `updatedAt` moved
 * backwards is not something this app can explain, and refetching an
 * unexplained difference is the safe way to be wrong.
 */
export function staleStudyIds(listing: StudyMetadata[], cached: CachedStudy[]): string[] {
  const have = new Map(cached.map((study) => [study.id, study.updatedAt]))
  return listing.filter((study) => have.get(study.id) !== study.updatedAt).map((study) => study.id)
}

/**
 * Cached studies the listing no longer mentions.
 *
 * A study can be deleted on lichess.org — the app cannot delete one itself, so
 * this is the *only* way one goes away — and nothing notifies this app. Its
 * absence from a full listing is the notification.
 */
export function vanishedStudyIds(listing: StudyMetadata[], cached: CachedStudy[]): string[] {
  const live = new Set(listing.map((study) => study.id))
  return cached.filter((study) => !live.has(study.id)).map((study) => study.id)
}

/** A cached study's game, by chapter id. */
export function gameOf(study: CachedStudy | null, chapterId: string): LibraryGame | null {
  return study?.games.find((game) => game.chapterId === chapterId) ?? null
}

const DB_NAME = 'chesspique.library'
const DB_VERSION = 1
const STORE = 'studies'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }).finally(() => db.close()),
  )
}

/**
 * Every study held locally.
 *
 * Failures are swallowed into an empty list on purpose: a browser in private
 * mode, or one with storage blocked, should cost the user a download rather
 * than an error message about a cache they never asked for.
 */
export async function loadCachedStudies(): Promise<CachedStudy[]> {
  try {
    return await transact<CachedStudy[]>('readonly', (store) => store.getAll())
  } catch {
    return []
  }
}

export async function saveCachedStudy(study: CachedStudy): Promise<void> {
  try {
    await transact('readwrite', (store) => store.put(study))
  } catch {
    // A cache that cannot be written is a cache miss next time, and nothing worse.
  }
}

export async function forgetCachedStudy(id: string): Promise<void> {
  try {
    await transact('readwrite', (store) => store.delete(id))
  } catch {
    // As above.
  }
}

/**
 * Ask the browser not to evict the library.
 *
 * Safari clears script-writable storage for sites it has not seen in about a
 * week, and this is the documented way to opt out. It can be refused, and a
 * refusal is not worth reporting — the cache is rebuildable by design.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
