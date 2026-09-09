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

/**
 * One call to the Lichess API, with the token attached and its errors mapped.
 *
 * Exported because the library layer needs exactly this and nothing more; it
 * takes its own `fetch` so its tests can run without a network, which is why
 * the caller supplies one rather than this file reaching for the global.
 */
export async function lichessRequest(
  path: string,
  token: string,
  init: RequestInit = {},
  doFetch: typeof fetch = (...args) => fetch(...args),
): Promise<Response> {
  const response = await doFetch(`https://lichess.org${path}`, {
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
  const response = await lichessRequest('/api/account', token)
  const account = (await response.json()) as { username?: string; id?: string }
  const username = account.username ?? account.id
  if (!username) throw new LichessApiError('Lichess did not say who is signed in.')
  return { username }
}

function parseLine(line: string): StudyMetadata | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line) as StudyMetadata
  } catch {
    // One malformed line should not lose the rest of the list.
    return null
  }
}

/**
 * The user's studies, handed over in batches as they arrive.
 *
 * Newline-delimited JSON, read from the response body as it streams rather
 * than after it finishes. Lichess throttles this to 50 studies a second
 * (lila, Study.scala: `.throttle(if isMe then 50 else 20, 1.second)`), so an
 * account with hundreds spends several seconds sending them — long enough
 * that showing the first ones straight away is the difference between a list
 * that fills in and a window that sits blank.
 *
 * Batched rather than one at a time so a fast stream costs a handful of
 * renders instead of one per study.
 */
export async function streamStudies(
  token: string,
  username: string,
  onBatch: (studies: StudyMetadata[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await lichessRequest(`/api/study/by/${encodeURIComponent(username)}`, token, {
    headers: { Accept: 'application/x-ndjson' },
    signal,
  })

  const reader = response.body?.getReader()
  if (!reader) {
    // No streaming body available: take the whole thing and hand it over once.
    const all = (await response.text()).split('\n').map(parseLine).filter((s) => s != null)
    if (all.length > 0) onBatch(all)
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // The last piece may be half a line; it waits for the next chunk.
    buffer = lines.pop() ?? ''
    const batch = lines.map(parseLine).filter((s) => s != null)
    if (batch.length > 0) onBatch(batch)
  }
  const last = parseLine(buffer + decoder.decode())
  if (last) onBatch([last])
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
  doFetch?: typeof fetch,
): Promise<ImportedChapter[]> {
  const body = new URLSearchParams({ pgn: options.pgn, name: options.name })
  if (options.orientation) body.set('orientation', options.orientation)

  const response = await lichessRequest(
    `/api/study/${encodeURIComponent(studyId)}/import-pgn`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    doFetch,
  )
  const result = (await response.json()) as { chapters?: Array<{ id: string; name: string }> }
  return (result.chapters ?? []).map((chapter) => ({
    ...chapter,
    url: `https://lichess.org/study/${studyId}/${chapter.id}`,
  }))
}
