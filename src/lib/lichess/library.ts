/**
 * Games kept in Lichess studies: a study is a folder, a chapter is a game.
 *
 * The whole of the study API is nine routes, and what it *lacks* shapes this
 * file more than what it has. There is no endpoint that lists a study's
 * chapters, so `fetchStudy` downloads all of it and the ids are read off the
 * `ChapterURL` tags; there is no rename, so a chapter's name is fixed when it
 * is imported; and there is no study delete on the API at all — `POST
 * /study/{id}/delete` is the web route, cookie-authenticated and without CORS,
 * so a browser holding a Bearer token cannot reach it. `deleteStudy` therefore
 * does not exist here and never will.
 *
 * Requests are serialized. Lichess allows an authenticated user three
 * concurrent study downloads, but nothing in this app needs more than one at a
 * time, and one queue is the same courtesy `ExplorerClient` already keeps.
 */

import { lichessRequest } from './studies'
import type { StudyMetadata } from './studies'

export { LichessApiError } from './studies'
export type { StudyMetadata } from './studies'

/** Lichess's own cap. Reported by the API when an import is refused. */
export const CHAPTERS_PER_STUDY = 64

export type StudyVisibility = 'public' | 'unlisted' | 'private'

/**
 * Who may do what in a study this app creates.
 *
 * The spec marks all five required on `POST /api/study`, so they cannot simply
 * be left out. These are the defaults a personal game library wants: nobody
 * else is a member, so the only meaningful question is what a visitor can do,
 * and a visitor should be able to read the game and nothing else.
 */
const CREATE_PERMISSIONS = {
  computer: 'everyone',
  explorer: 'everyone',
  cloneable: 'nobody',
  shareable: 'nobody',
  chat: 'nobody',
} as const

export class LibraryClient {
  /** Requests run one at a time; this is the tail of that chain. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly doFetch: typeof fetch = (...args) => fetch(...args)) {}

  private run<T>(work: () => Promise<T>): Promise<T> {
    // Chained off the tail rather than awaited, so one call's failure does not
    // poison the queue for the next.
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Every chapter of a study, as one PGN file. */
  fetchStudy(token: string, studyId: string): Promise<string> {
    return this.run(async () => {
      const response = await this.request(`/api/study/${enc(studyId)}.pgn?clocks=true&comments=true`, token)
      return response.text()
    })
  }

  /** One chapter, for reopening a game without downloading its whole study. */
  fetchChapter(token: string, studyId: string, chapterId: string): Promise<string> {
    return this.run(async () => {
      const path = `/api/study/${enc(studyId)}/${enc(chapterId)}.pgn?clocks=true&comments=true`
      const response = await this.request(path, token)
      return response.text()
    })
  }

  /**
   * A new study, which Lichess creates with one empty chapter already in it.
   *
   * Visibility is decided here and can never be read back — the listing
   * endpoint returns only id, name and two dates — so whatever is chosen has
   * to be remembered by the caller if it matters later.
   */
  createStudy(
    token: string,
    options: { name: string; visibility: StudyVisibility },
  ): Promise<{ id: string }> {
    return this.run(async () => {
      const response = await this.request('/api/study', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          name: options.name,
          visibility: options.visibility,
          ...CREATE_PERMISSIONS,
        }),
      })
      return (await response.json()) as { id: string }
    })
  }

  /**
   * Replace a chapter's moves. Tags are left exactly as they were.
   *
   * A blind overwrite — the API offers no version to check against — so
   * whether it is safe to call is the caller's question, not this one's.
   */
  replaceMoves(token: string, studyId: string, chapterId: string, pgn: string): Promise<void> {
    return this.run(async () => {
      await this.request(`/api/study/${enc(studyId)}/${enc(chapterId)}/moves`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ pgn }),
      })
    })
  }

  /**
   * Merge tags into a chapter. Only the tags given are touched.
   *
   * `pgn` here is tag lines alone — the endpoint ignores any moves. Build it
   * with `tagDiff`, which knows that a tag is removed by sending it empty
   * rather than by leaving it out.
   */
  updateTags(token: string, studyId: string, chapterId: string, pgn: string): Promise<void> {
    return this.run(async () => {
      await this.request(`/api/study/${enc(studyId)}/${enc(chapterId)}/tags`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ pgn }),
      })
    })
  }

  /**
   * Remove a chapter. Definitive, and Lichess replaces the last one with an
   * empty chapter rather than letting a study have none.
   */
  deleteChapter(token: string, studyId: string, chapterId: string): Promise<void> {
    return this.run(async () => {
      await this.request(`/api/study/${enc(studyId)}/${enc(chapterId)}`, token, {
        method: 'DELETE',
      })
    })
  }

  private request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    return lichessRequest(path, token, init, this.doFetch)
  }
}

function enc(value: string): string {
  return encodeURIComponent(value)
}

/**
 * The tag lines to send so a chapter's tags end up matching `after`.
 *
 * The endpoint keeps every tag it is not told about, so a tag the user deleted
 * survives unless it is sent back with an empty value. Sending the whole set
 * every time would work for changes but never for removals, and would also
 * rewrite tags Lichess maintains itself.
 */
export function tagDiff(
  before: Array<{ name: string; value: string }>,
  after: Array<{ name: string; value: string }>,
): string {
  const was = new Map(before.map((tag) => [tag.name, tag.value]))
  const lines: string[] = []

  for (const tag of after) {
    if (was.get(tag.name) !== tag.value) lines.push(`[${tag.name} "${escapeTag(tag.value)}"]`)
    was.delete(tag.name)
  }
  // Whatever is left was there before and is not there now.
  for (const name of was.keys()) lines.push(`[${name} ""]`)

  return lines.join('\n')
}

/** PGN quotes its tag values, so a quote or backslash inside one must escape. */
function escapeTag(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Studies as the picker wants them: the newest touched first. */
export function sortStudies(studies: StudyMetadata[]): StudyMetadata[] {
  return [...studies].sort((a, b) => b.updatedAt - a.updatedAt)
}
