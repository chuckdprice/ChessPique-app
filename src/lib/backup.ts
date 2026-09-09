/**
 * A file holding everything this browser knows that nothing else does.
 *
 * Which is less than it sounds, and that is the point. The games live in
 * Lichess studies; the tags live inside those games' PGNs; the study cache is
 * derived and rebuilds itself on the next visit. What is genuinely irreplaceable
 * is the grouping you invented — folders — the two recents lists, and your
 * settings. Losing those to a cleared browser is annoying rather than
 * catastrophic, and this is what makes it neither.
 *
 * **The list is an allowlist, and that is a safety property rather than
 * tidiness.** `chesspique.lichess` holds a live OAuth bearer token, and a
 * backup is a file people mail to themselves. A blocklist would have leaked it
 * the first time somebody added a key and forgot to exclude it; an allowlist
 * fails the other way, by forgetting to *include* something, which costs a
 * setting rather than an account.
 *
 * The same list guards the way back in. Restoring writes only these keys,
 * whatever a file happens to contain — so a hand-edited or hostile backup
 * cannot plant a token, or anything else, under a name the app trusts.
 */

/** The backup file's own format, not the app's. */
export const BACKUP_VERSION = 1

const MARK = 'chesspique-backup'

/**
 * Every key a backup carries, and the only keys a restore will write.
 *
 * Deliberately not derived from a prefix scan of localStorage: that would mean
 * a key added later is included by default, which is exactly how a token ends
 * up in a file somebody emails.
 */
export const BACKED_UP_KEYS = [
  'chesspique.appearance',
  'chesspique.engine',
  'chesspique.explorer',
  'chesspique.folders',
  'chesspique.recent-games',
  'chesspique.recent-studies',
] as const

export interface Backup {
  app: typeof MARK
  version: number
  savedAt: string
  data: Record<string, unknown>
}

export interface RestoreResult {
  restored: string[]
  /** In the file, but not a key a restore is allowed to write. */
  ignored: string[]
  /** On the allowlist, but absent from the file — left exactly as it was. */
  missing: string[]
}

export class BackupError extends Error {}

/**
 * Gather a backup.
 *
 * Values are stored parsed rather than as the strings localStorage holds, so
 * the file can be read and edited by a person. Everything on the list is JSON;
 * a value that will not parse is corrupt, and the loader that owns it would
 * discard it too, so it is left out rather than carried along.
 */
export function buildBackup(read: (key: string) => string | null, now: Date): Backup {
  const data: Record<string, unknown> = {}
  for (const key of BACKED_UP_KEYS) {
    const raw = read(key)
    if (raw == null) continue
    try {
      data[key] = JSON.parse(raw)
    } catch {
      /* Corrupt, and unreadable by whatever owns it. Nothing to preserve. */
    }
  }
  return { app: MARK, version: BACKUP_VERSION, savedAt: now.toISOString(), data }
}

/** What the file should be called, dated so several can sit in one folder. */
export function backupFileName(now: Date): string {
  const stamp = now.toISOString().slice(0, 10)
  return `chesspique-backup-${stamp}.json`
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

/**
 * Read a backup file, or say why it is not one.
 *
 * Checked rather than trusted: this is a file from a filesystem, and the worst
 * case is not a corrupt restore but a plausible-looking one.
 */
export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not JSON, so it is not a ChessPique backup.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BackupError('That file is not a ChessPique backup.')
  }
  const candidate = parsed as Partial<Backup>
  if (candidate.app !== MARK) {
    throw new BackupError('That file is not a ChessPique backup.')
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new BackupError(
      'That backup was written by a newer version of ChessPique than this one.',
    )
  }
  if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    throw new BackupError('That backup has nothing in it.')
  }
  return {
    app: MARK,
    version: candidate.version,
    savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : '',
    data: candidate.data as Record<string, unknown>,
  }
}

/**
 * Write a backup's contents back.
 *
 * Only allowlisted keys are written, whatever the file says, and a key the file
 * does not mention is left alone rather than cleared — a backup is something to
 * restore *from*, not a statement about everything that should exist.
 */
export function applyBackup(
  backup: Backup,
  write: (key: string, value: string) => void,
): RestoreResult {
  const allowed = new Set<string>(BACKED_UP_KEYS)
  const restored: string[] = []
  const ignored: string[] = []

  for (const [key, value] of Object.entries(backup.data)) {
    if (!allowed.has(key)) {
      ignored.push(key)
      continue
    }
    if (value === undefined) continue
    write(key, JSON.stringify(value))
    restored.push(key)
  }

  return {
    restored,
    ignored,
    missing: BACKED_UP_KEYS.filter((key) => !restored.includes(key)),
  }
}

/** A plain-English summary of what a file will restore, before it is applied. */
export function describeBackup(backup: Backup): string {
  const names: Record<string, string> = {
    'chesspique.appearance': 'appearance',
    'chesspique.engine': 'engine settings',
    'chesspique.explorer': 'explorer filters',
    'chesspique.folders': 'folders',
    'chesspique.recent-games': 'recent games',
    'chesspique.recent-studies': 'recent studies',
  }
  const present = BACKED_UP_KEYS.filter((key) => key in backup.data).map((key) => names[key] ?? key)
  if (present.length === 0) return 'nothing this version recognises'
  if (present.length === 1) return present[0]
  return `${present.slice(0, -1).join(', ')} and ${present[present.length - 1]}`
}
