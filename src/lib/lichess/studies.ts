/**
 * The bits of the Lichess API this app talks to, all of which send
 * `Access-Control-Allow-Origin: *`, so a page with a token can call them
 * directly. https://lichess.org/api#tag/studies
 */

export class LichessApiError extends Error {
  constructor(
    message: string,
    /** True when the token was rejected, so the caller can ask for a new one. */
    readonly unauthorized = false,
  ) {
    super(message)
  }
}

export interface StudyMetadata {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface ImportedChapter {
  id: string
  name: string
  /** Where the new chapter lives on Lichess. */
  url: string
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://lichess.org${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (response.status === 401 || response.status === 403) {
    throw new LichessApiError('Lichess no longer accepts this sign-in.', true)
  }
  if (!response.ok) {
    // Lichess explains 4xx failures in a JSON `error` field; anything else is
    // reported by its status alone.
    let detail = ''
    try {
      const body = (await response.json()) as { error?: string }
      detail = typeof body.error === 'string' ? body.error : ''
    } catch {
      detail = ''
    }
    throw new LichessApiError(detail || `Lichess returned HTTP ${response.status}.`)
  }
  return response
}

/** The signed-in user, needed because studies are listed by username. */
export async function fetchAccount(token: string): Promise<{ username: string }> {
  const response = await call('/api/account', token)
  const account = (await response.json()) as { username?: string; id?: string }
  const username = account.username ?? account.id
  if (!username) throw new LichessApiError('Lichess did not say who is signed in.')
  return { username }
}

/**
 * The user's studies, most recently updated first.
 *
 * Streamed as newline-delimited JSON. The whole list is small enough to read in
 * one go, so it is parsed after the fact rather than incrementally.
 */
export async function fetchStudies(token: string, username: string): Promise<StudyMetadata[]> {
  const response = await call(`/api/study/by/${encodeURIComponent(username)}`, token, {
    headers: { Accept: 'application/x-ndjson' },
  })
  const studies: StudyMetadata[] = []
  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue
    try {
      studies.push(JSON.parse(line) as StudyMetadata)
    } catch {
      // One malformed line should not lose the rest of the list.
    }
  }
  return studies.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Add the PGN to a study as a new chapter.
 *
 * A study holds at most 64 chapters, and Lichess says so itself when one is
 * full, so its message is passed straight through.
 */
export async function importPgn(
  token: string,
  studyId: string,
  options: { pgn: string; name: string; orientation?: 'white' | 'black' },
): Promise<ImportedChapter[]> {
  const body = new URLSearchParams({ pgn: options.pgn, name: options.name })
  if (options.orientation) body.set('orientation', options.orientation)

  const response = await call(`/api/study/${encodeURIComponent(studyId)}/import-pgn`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const result = (await response.json()) as { chapters?: Array<{ id: string; name: string }> }
  return (result.chapters ?? []).map((chapter) => ({
    ...chapter,
    url: `https://lichess.org/study/${studyId}/${chapter.id}`,
  }))
}
