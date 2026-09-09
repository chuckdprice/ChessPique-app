/**
 * The games and studies most recently opened, kept per browser.
 *
 * A shortcut rather than a record. The library already caches whole studies,
 * but reaching one game still means choosing its study and finding it in a list
 * of up to sixty-four; these two lists are the way back to what you were
 * actually working on.
 *
 * Every entry can go stale without this app hearing about it — a chapter is
 * deleted on lichess.org, a study is made private, a token expires — so nothing
 * here is trusted. An entry that fails to open is dropped rather than reported
 * as an error, which is why `withoutGame` exists beside the two that add.
 */

import { readStored } from './storage'

export interface RecentGame {
  studyId: string
  chapterId: string
  /** Named at the time, so the list reads without the study being downloaded. */
  studyName: string
  chapterName: string
  openedAt: number
}

export interface RecentStudy {
  studyId: string
  studyName: string
  openedAt: number
}

const GAMES_KEY = 'chesspique.recent-games'
const STUDIES_KEY = 'chesspique.recent-studies'

/**
 * How many of each are kept.
 *
 * Ten, which is what the two menus show: a list long enough to cover a
 * session's worth of moving between games, and short enough to read at a
 * glance. Past that, finding the entry you want in it is no easier than
 * finding the game in its study.
 */
export const RECENTS_KEPT = 10

/** One game moved to the front, without duplicates. */
export function withRecentGame(recent: RecentGame[], entry: RecentGame): RecentGame[] {
  return [
    entry,
    ...recent.filter((g) => !(g.studyId === entry.studyId && g.chapterId === entry.chapterId)),
  ].slice(0, RECENTS_KEPT)
}

/** One study moved to the front, without duplicates. */
export function withRecentStudy(recent: RecentStudy[], entry: RecentStudy): RecentStudy[] {
  return [entry, ...recent.filter((s) => s.studyId !== entry.studyId)].slice(0, RECENTS_KEPT)
}

/** Drop a game that would not open — deleted, or no longer readable. */
export function withoutGame(
  recent: RecentGame[],
  studyId: string,
  chapterId: string,
): RecentGame[] {
  return recent.filter((g) => !(g.studyId === studyId && g.chapterId === chapterId))
}

/**
 * Drop every game belonging to a study that has gone.
 *
 * A study's absence from the listing is the only notice this app gets that it
 * was deleted, and its games cannot outlive it in a list that offers to open
 * them.
 */
export function withoutStudies(recent: RecentGame[], studyIds: string[]): RecentGame[] {
  const gone = new Set(studyIds)
  return recent.filter((g) => !gone.has(g.studyId))
}

/** Only the entries whose study the signed-in user still has. */
export function prunedStudies(recent: RecentStudy[], liveIds: string[]): RecentStudy[] {
  const live = new Set(liveIds)
  return recent.filter((s) => live.has(s.studyId))
}

function read<T>(key: string, isValid: (value: unknown) => boolean): T[] {
  try {
    // readStored, not getItem: every key in this app goes through the rename
    // migration, and one that does not is a key that loses its history the next
    // time something is renamed.
    const raw = readStored(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValid).slice(0, RECENTS_KEPT) as T[]
  } catch {
    return []
  }
}

function isGame(value: unknown): boolean {
  const g = value as Partial<RecentGame> | null
  return (
    !!g && typeof g.studyId === 'string' && typeof g.chapterId === 'string' && !!g.studyId.length
  )
}

function isStudy(value: unknown): boolean {
  const s = value as Partial<RecentStudy> | null
  return !!s && typeof s.studyId === 'string' && !!s.studyId.length
}

export function loadRecentGames(): RecentGame[] {
  return read<RecentGame>(GAMES_KEY, isGame)
}

export function loadRecentStudies(): RecentStudy[] {
  return read<RecentStudy>(STUDIES_KEY, isStudy)
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* A list that cannot be written is a shortcut nobody gets, and nothing worse. */
  }
}

export function saveRecentGames(recent: RecentGame[]): void {
  write(GAMES_KEY, recent)
}

export function saveRecentStudies(recent: RecentStudy[]): void {
  write(STUDIES_KEY, recent)
}

/**
 * Note a game as just opened, and hand back the list it belongs to.
 *
 * Read-modify-write against storage rather than against a caller's copy: a game
 * is remembered from two places — opening one from the library, and saving one
 * to a study — and having each hold its own list would let the later write
 * throw away what the other had recorded.
 */
export function rememberGame(entry: RecentGame): RecentGame[] {
  const next = withRecentGame(loadRecentGames(), entry)
  saveRecentGames(next)
  return next
}

/** The same, for the study a game was picked out of. */
export function rememberStudy(entry: RecentStudy): RecentStudy[] {
  const next = withRecentStudy(loadRecentStudies(), entry)
  saveRecentStudies(next)
  return next
}
