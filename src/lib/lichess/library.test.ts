import { describe, expect, it } from 'vitest'
import { LibraryClient, LichessApiError, sortStudies, tagDiff } from './library'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

/** A fetch that records what it was asked and answers from a script. */
function recorder(
  responses: Array<{ status?: number; body?: string }> = [{ body: '' }],
): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = []
  let i = 0
  const doFetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const body = init.body
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string> | undefined) },
      body: body == null ? null : String(body),
    })
    const scripted = responses[Math.min(i, responses.length - 1)]
    i += 1
    const status = scripted.status ?? 200
    // A 204 is not allowed to carry a body at all, not even an empty string.
    return new Response(status === 204 ? null : (scripted.body ?? ''), { status })
  }) as unknown as typeof fetch
  return { calls, fetch: doFetch }
}

describe('LibraryClient', () => {
  it('exports a whole study with clocks and comments', async () => {
    const { calls, fetch } = recorder([{ body: '[Event "A"]\n\n1. e4 *' }])
    const pgn = await new LibraryClient(fetch).fetchStudy('tok', 'abcd1234')

    expect(pgn).toContain('[Event "A"]')
    expect(calls[0].url).toBe(
      'https://lichess.org/api/study/abcd1234.pgn?clocks=true&comments=true',
    )
    expect(calls[0].headers.Authorization).toBe('Bearer tok')
  })

  it('exports one chapter by id', async () => {
    const { calls, fetch } = recorder()
    await new LibraryClient(fetch).fetchChapter('tok', 'abcd1234', 'wxyz5678')

    expect(calls[0].url).toBe(
      'https://lichess.org/api/study/abcd1234/wxyz5678.pgn?clocks=true&comments=true',
    )
  })

  it('sends every field the create endpoint requires', async () => {
    const { calls, fetch } = recorder([{ body: '{"id":"newstudy"}' }])
    const created = await new LibraryClient(fetch).createStudy('tok', {
      name: 'My games',
      visibility: 'private',
    })

    expect(created.id).toBe('newstudy')
    expect(calls[0].method).toBe('POST')
    const sent = new URLSearchParams(calls[0].body ?? '')
    expect(sent.get('name')).toBe('My games')
    expect(sent.get('visibility')).toBe('private')
    // The spec marks all five required; a create without them is a 400.
    for (const field of ['computer', 'explorer', 'cloneable', 'shareable', 'chat']) {
      expect(sent.get(field)).toBeTruthy()
    }
  })

  it('replaces moves without touching tags', async () => {
    const { calls, fetch } = recorder([{ status: 204 }])
    await new LibraryClient(fetch).replaceMoves('tok', 'abcd1234', 'wxyz5678', '1. d4 *')

    expect(calls[0].url).toBe('https://lichess.org/api/study/abcd1234/wxyz5678/moves')
    expect(new URLSearchParams(calls[0].body ?? '').get('pgn')).toBe('1. d4 *')
  })

  it('deletes a chapter', async () => {
    const { calls, fetch } = recorder([{ status: 204 }])
    await new LibraryClient(fetch).deleteChapter('tok', 'abcd1234', 'wxyz5678')

    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].url).toBe('https://lichess.org/api/study/abcd1234/wxyz5678')
  })

  it('reports a rejected token as unauthorized so the caller can re-ask', async () => {
    const { fetch } = recorder([{ status: 401 }])
    const error = await new LibraryClient(fetch)
      .fetchStudy('stale', 'abcd1234')
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LichessApiError)
    expect((error as LichessApiError).unauthorized).toBe(true)
  })

  it("passes Lichess's own explanation through, so a full study says so", async () => {
    const { fetch } = recorder([{ status: 400, body: '{"error":"Maximum 64 chapters per study"}' }])
    const error = await new LibraryClient(fetch)
      .fetchStudy('tok', 'abcd1234')
      .catch((e: unknown) => e)

    expect((error as Error).message).toBe('Maximum 64 chapters per study')
  })

  it('runs one request at a time', async () => {
    let running = 0
    let overlapped = false
    const doFetch = (async () => {
      running += 1
      if (running > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return new Response('')
    }) as unknown as typeof fetch

    const client = new LibraryClient(doFetch)
    await Promise.all([
      client.fetchStudy('tok', 'aaaaaaaa'),
      client.fetchStudy('tok', 'bbbbbbbb'),
      client.fetchStudy('tok', 'cccccccc'),
    ])

    expect(overlapped).toBe(false)
  })

  it('keeps serving after a request fails', async () => {
    const { fetch } = recorder([{ status: 500 }, { body: 'second' }])
    const client = new LibraryClient(fetch)

    await expect(client.fetchStudy('tok', 'aaaaaaaa')).rejects.toBeInstanceOf(LichessApiError)
    await expect(client.fetchStudy('tok', 'bbbbbbbb')).resolves.toBe('second')
  })
})

describe('tagDiff', () => {
  const tag = (name: string, value: string) => ({ name, value })

  it('sends only what changed', () => {
    const before = [tag('White', 'Smith'), tag('Black', 'Jones')]
    const after = [tag('White', 'Smith'), tag('Black', 'Brown')]

    expect(tagDiff(before, after)).toBe('[Black "Brown"]')
  })

  it('sends a removed tag as an empty value, because omitting it keeps it', () => {
    const before = [tag('White', 'Smith'), tag('Board', '4')]
    const after = [tag('White', 'Smith')]

    expect(tagDiff(before, after)).toBe('[Board ""]')
  })

  it('sends an added tag', () => {
    expect(tagDiff([], [tag('Event', 'DCC')])).toBe('[Event "DCC"]')
  })

  it('is empty when nothing changed, so no request need be made', () => {
    const tags = [tag('White', 'Smith')]
    expect(tagDiff(tags, [...tags])).toBe('')
  })

  it('escapes a quote inside a value', () => {
    expect(tagDiff([], [tag('Event', 'The "big" one')])).toBe('[Event "The \\"big\\" one"]')
  })
})

describe('sortStudies', () => {
  it('puts the most recently touched study first', () => {
    const studies = [
      { id: 'a', name: 'A', createdAt: 1, updatedAt: 10 },
      { id: 'b', name: 'B', createdAt: 2, updatedAt: 30 },
      { id: 'c', name: 'C', createdAt: 3, updatedAt: 20 },
    ]
    expect(sortStudies(studies).map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not reorder the caller\'s array', () => {
    const studies = [
      { id: 'a', name: 'A', createdAt: 1, updatedAt: 10 },
      { id: 'b', name: 'B', createdAt: 2, updatedAt: 30 },
    ]
    sortStudies(studies)
    expect(studies.map((s) => s.id)).toEqual(['a', 'b'])
  })
})
