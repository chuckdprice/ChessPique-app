/**
 * Reading what a browser already stored, under a name it may not use any more.
 *
 * The app's keys were `chessnoter.*` until it was renamed to ChessPique on
 * 30 August 2026. Anyone who had used it by then has their appearance, their
 * engine settings, their explorer filters and — the one that would actually
 * hurt — their signed-in Lichess session under the old names. Renaming the keys
 * without moving the values would have logged them out and reset everything,
 * for a tidiness nobody can see, which is why the keys were left alone through
 * two earlier renames.
 *
 * So the first read under a new name adopts what the old one held and takes the
 * old key away. It costs one extra `getItem` on a cold start and nothing after
 * that, and it can be deleted once no browser could still be carrying the old
 * keys — there is no hurry, and no way to know when that is.
 */

const PREFIX = 'chesspique.'
const LEGACY_PREFIX = 'chessnoter.'

/** The name this key had before the rename, or null if it never had another. */
export function legacyKey(key: string): string | null {
  return key.startsWith(PREFIX) ? `${LEGACY_PREFIX}${key.slice(PREFIX.length)}` : null
}

/**
 * The stored string for `key`, migrating the old name's value across if that is
 * where it still lives. Null when neither name holds anything — and when
 * storage cannot be read at all, which callers already treat as "nothing
 * stored" rather than as an error.
 */
export function readStored(key: string): string | null {
  try {
    const current = localStorage.getItem(key)
    if (current != null) return current

    const old = legacyKey(key)
    const carried = old ? localStorage.getItem(old) : null
    if (carried == null) return null

    // Moved rather than copied: leaving both would let a stale value come back
    // if the new one were ever cleared, which reads as settings rising again
    // from the dead.
    localStorage.setItem(key, carried)
    localStorage.removeItem(old!)
    return carried
  } catch {
    return null
  }
}
