/**
 * Folders over studies, kept in this browser and nowhere else.
 *
 * Lichess has no notion of a folder — a study's metadata is a name and two
 * dates, and there is no field this app could write one into. So the grouping
 * is local: a map from study id to a folder name, and everything not in it is
 * unfiled.
 *
 * Which means it drifts, and the code is arranged around that rather than
 * against it. A study created or deleted on lichess.org never tells this app,
 * so a folder can name a study that is gone and a new study arrives belonging
 * to nothing. `pruneFolders` handles the first; the unfiled bucket is the
 * answer to the second, and it is a real place rather than an error state.
 *
 * A folder is a plain name, not a path. Nesting would want a tree to draw it
 * and a way to move a branch, and neither is worth it until a reader has more
 * folders than fit on one line. The stored shape does not stand in the way of
 * it later: a name containing "/" is already a legal value here.
 */

import { readStored } from './storage'

/** Study id to folder name. A study missing from this is unfiled. */
export type FolderMap = Record<string, string>

const KEY = 'chesspique.folders'

/** Longest a folder name may be, so a chip stays a chip. */
export const FOLDER_NAME_MAX = 40

/**
 * A folder name as it will be stored, or null if it is not one.
 *
 * Trimmed, and collapsed inside, so "  Openings " and "Openings" cannot both
 * exist and look identical in the list.
 */
export function cleanFolderName(name: string): string | null {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  return cleaned.length > 0 && cleaned.length <= FOLDER_NAME_MAX ? cleaned : null
}

/**
 * Put a study in a folder, or take it out of one.
 *
 * An existing folder is matched case-insensitively and its own spelling kept,
 * so typing "openings" when "Openings" exists files it there rather than
 * making a second folder that reads the same.
 */
export function assignFolder(map: FolderMap, studyId: string, folder: string | null): FolderMap {
  const next = { ...map }
  if (folder == null) {
    delete next[studyId]
    return next
  }
  const cleaned = cleanFolderName(folder)
  if (!cleaned) return map
  const existing = foldersOf(map).find((f) => f.toLowerCase() === cleaned.toLowerCase())
  next[studyId] = existing ?? cleaned
  return next
}

/** Every folder in use, in the order a reader would look for them. */
export function foldersOf(map: FolderMap): string[] {
  return [...new Set(Object.values(map))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

/** Rename a folder, taking every study in it along. */
export function renameFolder(map: FolderMap, from: string, to: string): FolderMap {
  const cleaned = cleanFolderName(to)
  if (!cleaned) return map
  const next: FolderMap = {}
  for (const [studyId, folder] of Object.entries(map)) {
    next[studyId] = folder === from ? cleaned : folder
  }
  return next
}

/**
 * Empty a folder, which is the only way one goes away.
 *
 * There is no list of folders apart from the studies in them — a folder is
 * exactly the set of studies naming it — so unfiling the last one deletes it.
 */
export function removeFolder(map: FolderMap, folder: string): FolderMap {
  const next: FolderMap = {}
  for (const [studyId, name] of Object.entries(map)) {
    if (name !== folder) next[studyId] = name
  }
  return next
}

/**
 * Drop entries for studies the listing no longer has.
 *
 * The same notice-by-absence the cache and the recents rely on: a study
 * deleted on lichess.org is only ever discovered by not being listed.
 */
export function pruneFolders(map: FolderMap, liveIds: string[]): FolderMap {
  const live = new Set(liveIds)
  const next: FolderMap = {}
  for (const [studyId, folder] of Object.entries(map)) {
    if (live.has(studyId)) next[studyId] = folder
  }
  return next
}

/**
 * What the folder bar is showing.
 *
 * A discriminated shape rather than `string | null`, because "everything" and
 * "the ones in no folder" are both real choices and neither is the absence of
 * one — spelling either as null or "" is the kind of sentinel that reads as a
 * bug the first time a folder is legitimately named nothing.
 */
export type FolderFilter = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'named'; name: string }

export function matchesFilter(map: FolderMap, studyId: string, filter: FolderFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'unfiled') return !(studyId in map)
  return map[studyId] === filter.name
}

/** True when the bar's selection no longer names a folder that exists. */
export function filterIsStale(map: FolderMap, filter: FolderFilter): boolean {
  return filter.kind === 'named' && !foldersOf(map).includes(filter.name)
}

/** The ids in one folder; `null` asks for the unfiled ones. */
export function studiesIn(map: FolderMap, folder: string | null, allIds: string[]): string[] {
  return folder == null
    ? allIds.filter((id) => !(id in map))
    : allIds.filter((id) => map[id] === folder)
}

export function loadFolders(): FolderMap {
  try {
    // readStored, not getItem: a key added without it is the one that loses its
    // history at the next rename.
    const raw = readStored(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: FolderMap = {}
    for (const [studyId, folder] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof folder === 'string') {
        const cleaned = cleanFolderName(folder)
        if (cleaned) out[studyId] = cleaned
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveFolders(map: FolderMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* A grouping that cannot be written is one nobody gets, and nothing worse. */
  }
}
