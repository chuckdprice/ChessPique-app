/**
 * Folders over studies, kept in this browser and nowhere else.
 *
 * Lichess has no notion of a folder — a study's metadata is a name and two
 * dates, and there is no field this app could write one into. So the grouping
 * is local: a list of folders, and a map saying which folder each study is in.
 *
 * The list is the part that took a second try. A folder used to *be* the set of
 * studies naming it, with no separate record, which made it impossible to
 * create one before it had a member and impossible to manage one afterwards —
 * emptying a folder deleted it, and there was nothing to rename. Folders are
 * their own objects now: an empty folder is a real, useful thing to have made a
 * moment before filing the first study into it.
 *
 * The map drifts, because a study created or deleted on lichess.org never tells
 * this app. `pruneFolders` drops memberships for studies that have gone; the
 * folders themselves survive, since an empty one is legitimate. Everything not
 * in the map is unfiled, which is a real place rather than an error state.
 *
 * A folder is a plain name, not a path. Nesting wants a tree to draw it and a
 * way to move a branch, and neither is worth it until a reader has more folders
 * than fit on one line; a name containing "/" is already a legal value here if
 * it ever is.
 */

import { readStored } from './storage'

export interface Folders {
  /** Every folder that exists, empty ones included. */
  names: string[]
  /** Study id to folder name. A study missing from this is unfiled. */
  of: Record<string, string>
}

export const EMPTY_FOLDERS: Folders = { names: [], of: {} }

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

/** The name already in use that matches this one but for case, if any. */
function existing(folders: Folders, name: string): string | undefined {
  return folders.names.find((f) => f.toLowerCase() === name.toLowerCase())
}

function sorted(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * Make a folder, empty.
 *
 * A name that differs only by case is the folder that already exists, so
 * "openings" does not become a second "Openings" nobody can tell apart.
 */
export function createFolder(folders: Folders, name: string): Folders {
  const cleaned = cleanFolderName(name)
  if (!cleaned || existing(folders, cleaned)) return folders
  return { ...folders, names: sorted([...folders.names, cleaned]) }
}

/**
 * Put a study in a folder, or take it out of one.
 *
 * Filing into a folder that does not exist yet makes it, so that the box on a
 * study can be typed into without visiting anything else first.
 */
export function assignFolder(folders: Folders, studyId: string, name: string | null): Folders {
  if (name == null) {
    const of = { ...folders.of }
    delete of[studyId]
    return { ...folders, of }
  }
  const cleaned = cleanFolderName(name)
  if (!cleaned) return folders
  const match = existing(folders, cleaned) ?? cleaned
  return {
    names: folders.names.includes(match) ? folders.names : sorted([...folders.names, match]),
    of: { ...folders.of, [studyId]: match },
  }
}

/** Every folder, in the order a reader would look for them. */
export function foldersOf(folders: Folders): string[] {
  return sorted(folders.names)
}

/** How many studies are in one folder, out of the ids given. */
export function countIn(folders: Folders, name: string, ids: string[]): number {
  return ids.filter((id) => folders.of[id] === name).length
}

/** Rename a folder, taking every study in it along. */
export function renameFolder(folders: Folders, from: string, to: string): Folders {
  const cleaned = cleanFolderName(to)
  if (!cleaned || !folders.names.includes(from)) return folders
  // Renaming onto a name that already exists merges the two, which is what the
  // reader asked for by typing it — and the alternative is two folders that
  // read the same.
  const names = sorted([...new Set(folders.names.map((n) => (n === from ? cleaned : n)))])
  const of: Record<string, string> = {}
  for (const [studyId, name] of Object.entries(folders.of)) {
    of[studyId] = name === from ? cleaned : name
  }
  return { names, of }
}

/**
 * Delete a folder. Its studies become unfiled; nothing on Lichess is touched.
 */
export function removeFolder(folders: Folders, name: string): Folders {
  const of: Record<string, string> = {}
  for (const [studyId, folder] of Object.entries(folders.of)) {
    if (folder !== name) of[studyId] = folder
  }
  return { names: folders.names.filter((n) => n !== name), of }
}

/**
 * Drop memberships for studies the listing no longer has.
 *
 * The same notice-by-absence the cache and the recents rely on. The folders
 * themselves are left alone: a study being deleted on lichess.org is no reason
 * to throw away the folder it happened to be the last member of.
 */
export function pruneFolders(folders: Folders, liveIds: string[]): Folders {
  const live = new Set(liveIds)
  const of: Record<string, string> = {}
  for (const [studyId, name] of Object.entries(folders.of)) {
    if (live.has(studyId)) of[studyId] = name
  }
  return { ...folders, of }
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

export function matchesFilter(folders: Folders, studyId: string, filter: FolderFilter): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'unfiled') return !(studyId in folders.of)
  return folders.of[studyId] === filter.name
}

/** True when the bar's selection no longer names a folder that exists. */
export function filterIsStale(folders: Folders, filter: FolderFilter): boolean {
  return filter.kind === 'named' && !folders.names.includes(filter.name)
}

export function loadFolders(): Folders {
  try {
    // readStored, not getItem: a key added without it is the one that loses its
    // history at the next rename.
    const raw = readStored(KEY)
    if (!raw) return EMPTY_FOLDERS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_FOLDERS

    const record = parsed as Record<string, unknown>
    // The first shape was a bare study-id-to-name map with no folder list.
    // Anyone who made a folder before folders became objects has one of those,
    // and reading it as "no folders at all" would quietly lose their grouping.
    const legacy = !Array.isArray(record.names) && typeof record.of !== 'object'
    const of = cleanMap(legacy ? record : ((record.of as Record<string, unknown>) ?? {}))
    const declared = Array.isArray(record.names)
      ? record.names.filter((n): n is string => typeof n === 'string')
      : []
    const names = new Set<string>()
    for (const name of [...declared, ...Object.values(of)]) {
      const cleaned = cleanFolderName(name)
      if (cleaned) names.add(cleaned)
    }
    return { names: sorted([...names]), of }
  } catch {
    return EMPTY_FOLDERS
  }
}

function cleanMap(raw: Record<string, unknown>): Record<string, string> {
  const of: Record<string, string> = {}
  for (const [studyId, name] of Object.entries(raw)) {
    if (typeof name !== 'string') continue
    const cleaned = cleanFolderName(name)
    if (cleaned) of[studyId] = cleaned
  }
  return of
}

export function saveFolders(folders: Folders): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders))
  } catch {
    /* A grouping that cannot be written is one nobody gets, and nothing worse. */
  }
}
