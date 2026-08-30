import { describe, expect, it, vi } from 'vitest'
import {
  ExplorerAbandonedError,
  ExplorerAuthError,
  ExplorerClient,
  ExplorerNeedsPlayerError,
  ExplorerRateLimitError,
  RATE_LIMIT_COOLDOWN_MS,
  explorerUrl,
  totalGames,
} from './explorer'

/** A trimmed copy of the shape the published spec's example carries. */
const SAMPLE = {
  white: 5061745,
  draws: 492487,
  black: 4458129,
  opening: { eco: 'D10', name: 'Slav Defense: Exchange Variation' },
  moves: [
    {
      uci: 'c6d5',
      san: 'cxd5',
      averageRating: 1806,
      white: 4517660,
      draws: 450366,
      black: 4016728,
      game: null,
      opening: null,
    },
    {
      uci: 'g8f6',
      san: 'Nf6',
      averageRating: 1973,
      white: 195502,
      draws: 17425,
      black: 184987,
      game: null,
      opening: { eco: 'D06', name: "Queen's Gambit Declined: Marshall Defense" },
    },
  ],
}

const FEN = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

function ok(body: unknown = SAMPLE) {
  return new Response(JSON.stringify(body), { status: 200 })
}

/**
 * A latch the stub fetch waits on. Opened once, it stays open — a request the
 * queue only starts *after* the release still has to be able to finish, which
 * a list of one-shot resolvers cannot do.
 */
function gate() {
  let open = false
  const waiters: Array<() => void> = []
  return {
    wait: () => (open ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
    open: () => {
      open = true
      waiters.splice(0).forEach((r) => r())
    },
  }
}

/** A fetch that hands back responses in order and records every call. */
function stubFetch(responses: Array<() => Promise<Response> | Response>) {
  const calls: string[] = []
  let i = 0
  const fn = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url))
    const next = responses[Math.min(i, responses.length - 1)]
    i += 1
    return next()
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('explorerUrl', () => {
  it('asks the documented host, and for no game lists', () => {
    const url = new URL(explorerUrl({ db: 'lichess', fen: FEN }))
    // explorer.lichess.org, not lichess.org and not the old .ovh host.
    expect(url.origin).toBe('https://explorer.lichess.org')
    expect(url.pathname).toBe('/lichess')
    expect(url.searchParams.get('fen')).toBe(FEN)
    expect(url.searchParams.get('topGames')).toBe('0')
    expect(url.searchParams.get('recentGames')).toBe('0')
  })

  it('sends the date bounds in each endpoint\'s own units', () => {
    // Months for /lichess, years for /masters — the spec types them
    // differently, and a month sent to masters filters nothing at all.
    const lichess = new URL(
      explorerUrl({ db: 'lichess', fen: FEN, since: '2023-04', until: '2025-11' }),
    )
    expect(lichess.searchParams.get('since')).toBe('2023-04')
    expect(lichess.searchParams.get('until')).toBe('2025-11')

    const masters = new URL(explorerUrl({ db: 'masters', fen: FEN, since: '1998' }))
    expect(masters.searchParams.get('since')).toBe('1998')
    expect(masters.searchParams.has('until')).toBe(false)
  })

  it('leaves an empty bound out rather than sending an empty parameter', () => {
    const url = new URL(explorerUrl({ db: 'lichess', fen: FEN, since: '', until: '' }))
    expect(url.searchParams.has('since')).toBe(false)
    expect(url.searchParams.has('until')).toBe(false)
  })

  it('sends speeds and ratings to the Lichess database only', () => {
    const lichess = new URL(
      explorerUrl({ db: 'lichess', fen: FEN, speeds: ['blitz', 'rapid'], ratings: [1600, 1800] }),
    )
    expect(lichess.searchParams.get('speeds')).toBe('blitz,rapid')
    expect(lichess.searchParams.get('ratings')).toBe('1600,1800')

    // Masters has no speeds or rating bands; sending them would be noise.
    const masters = new URL(
      explorerUrl({ db: 'masters', fen: FEN, speeds: ['blitz'], ratings: [1600] }),
    )
    expect(masters.pathname).toBe('/masters')
    expect(masters.searchParams.has('speeds')).toBe(false)
    expect(masters.searchParams.has('ratings')).toBe(false)
  })
})

describe('reading a result', () => {
  it('keeps the moves and the opening, and counts the games', async () => {
    const { fn } = stubFetch([() => ok()])
    const result = await new ExplorerClient(fn).lookup({ db: 'lichess', fen: FEN }, 'tok')
    expect(result.opening).toEqual({ eco: 'D10', name: 'Slav Defense: Exchange Variation' })
    expect(result.moves.map((m) => m.san)).toEqual(['cxd5', 'Nf6'])
    expect(totalGames(result)).toBe(5061745 + 492487 + 4458129)
    expect(totalGames(result.moves[0])).toBe(4517660 + 450366 + 4016728)
  })

  it('sends the token as a bearer, which the endpoint now requires', async () => {
    const { fn } = stubFetch([() => ok()])
    await new ExplorerClient(fn).lookup({ db: 'masters', fen: FEN }, 'tok')
    const init = (fn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('refuses to send anything without a token', async () => {
    const { fn, calls } = stubFetch([() => ok()])
    await expect(
      new ExplorerClient(fn).lookup({ db: 'masters', fen: FEN }, ''),
    ).rejects.toBeInstanceOf(ExplorerAuthError)
    expect(calls).toHaveLength(0)
  })

  it('reads a 401 as sign-in trouble, not as a broken position', async () => {
    const { fn } = stubFetch([() => new Response('nginx says no', { status: 401 })])
    await expect(
      new ExplorerClient(fn).lookup({ db: 'masters', fen: FEN }, 'stale'),
    ).rejects.toBeInstanceOf(ExplorerAuthError)
  })
})

describe('being a good citizen', () => {
  it('treats a change of filter as a different question', async () => {
    const { fn, calls } = stubFetch([() => ok()])
    const client = new ExplorerClient(fn)
    await client.lookup({ db: 'lichess', fen: FEN, ratings: [1600] }, 'tok')
    expect(client.cached({ db: 'lichess', fen: FEN, ratings: [1600] })).not.toBeNull()
    // Same position, narrower filter: the cached wider answer must not be
    // handed back as though it were the filtered one.
    expect(client.cached({ db: 'lichess', fen: FEN, ratings: [1600, 1800] })).toBeNull()
    expect(client.cached({ db: 'lichess', fen: FEN })).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('answers a repeat position from the cache, without asking again', async () => {
    const { fn, calls } = stubFetch([() => ok()])
    const client = new ExplorerClient(fn)
    await client.lookup({ db: 'lichess', fen: FEN }, 'tok')
    await client.lookup({ db: 'lichess', fen: FEN }, 'tok')
    expect(calls).toHaveLength(1)
    expect(client.cached({ db: 'lichess', fen: FEN })).not.toBeNull()
    // A different database is a different question about the same position.
    expect(client.cached({ db: 'masters', fen: FEN })).toBeNull()
  })

  it('never has two requests in flight at once', async () => {
    let inFlight = 0
    let peak = 0
    const g = gate()
    const fn = (async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await g.wait()
      inFlight -= 1
      return ok()
    }) as unknown as typeof fetch

    const client = new ExplorerClient(fn)
    const first = client.lookup({ db: 'lichess', fen: 'a' }, 'tok')
    const second = client.lookup({ db: 'lichess', fen: 'b' }, 'tok')
    // Let the queue start whatever it is going to start.
    await Promise.resolve()
    await Promise.resolve()
    expect(peak).toBe(1)

    g.open()
    await Promise.allSettled([first, second])
    expect(peak).toBe(1)
  })

  it('drops a waiting position for a newer one instead of fetching both', async () => {
    const g = gate()
    const { fn, calls } = stubFetch([
      async () => {
        await g.wait()
        return ok()
      },
    ])
    const client = new ExplorerClient(fn)
    const first = client.lookup({ db: 'lichess', fen: 'a' }, 'tok')
    const stale = client.lookup({ db: 'lichess', fen: 'b' }, 'tok')
    const newest = client.lookup({ db: 'lichess', fen: 'c' }, 'tok')

    await expect(stale).rejects.toBeInstanceOf(ExplorerAbandonedError)
    g.open()
    await Promise.allSettled([first, newest])

    // Three positions asked for, two fetched: the one in flight and the last
    // one wanted. Stepping through a game must not spend a request per key.
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('fen=c')
  })

  it('stops sending for a minute after a 429', async () => {
    const { fn, calls } = stubFetch([() => new Response('slow down', { status: 429 })])
    const client = new ExplorerClient(fn)
    const before = Date.now()

    await expect(client.lookup({ db: 'lichess', fen: 'a' }, 'tok')).rejects.toBeInstanceOf(
      ExplorerRateLimitError,
    )
    expect(client.cooldownRemaining()).toBeGreaterThan(RATE_LIMIT_COOLDOWN_MS - 1000)

    // The next position fails without touching the network at all — the point
    // of the cooldown is that a throttled client goes quiet, not that it keeps
    // knocking and collecting 429s.
    await expect(client.lookup({ db: 'lichess', fen: 'b' }, 'tok')).rejects.toBeInstanceOf(
      ExplorerRateLimitError,
    )
    expect(calls).toHaveLength(1)
    expect(client.cooldownRemaining(before + RATE_LIMIT_COOLDOWN_MS + 1)).toBe(0)
  })

  it('waits longer when Retry-After asks for longer', async () => {
    const { fn } = stubFetch([
      () => new Response('slow down', { status: 429, headers: { 'retry-after': '300' } }),
    ])
    const client = new ExplorerClient(fn)
    await expect(client.lookup({ db: 'lichess', fen: 'a' }, 'tok')).rejects.toBeInstanceOf(
      ExplorerRateLimitError,
    )
    expect(client.cooldownRemaining()).toBeGreaterThan(290_000)
  })
})

/** A body that hands out NDJSON in the chunks the caller chooses. */
function ndjson(chunks: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  const stream = {
    getReader: () => ({
      read: async () =>
        i < chunks.length
          ? { done: false, value: encoder.encode(chunks[i++]) }
          : { done: true, value: undefined },
      cancel: async () => {},
    }),
  }
  return new Response(null, { status: 200 }) &&
    ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
      json: async () => ({}),
    } as unknown as Response)
}

const PLAYER = { db: 'player', fen: FEN, player: 'DragonBeard', color: 'black' } as const

describe('the player database', () => {
  it('sends the player and colour it requires, and no rating bands', () => {
    const url = new URL(
      explorerUrl({ ...PLAYER, speeds: ['rapid'], modes: ['rated'], ratings: [1600] }),
    )
    expect(url.pathname).toBe('/player')
    expect(url.searchParams.get('player')).toBe('DragonBeard')
    expect(url.searchParams.get('color')).toBe('black')
    expect(url.searchParams.get('speeds')).toBe('rapid')
    expect(url.searchParams.get('modes')).toBe('rated')
    // Rating bands are the Lichess database's filter; the player endpoint
    // takes no such parameter and sending one is noise at best.
    expect(url.searchParams.has('ratings')).toBe(false)
  })

  it('refuses to ask for a player it has not been given', async () => {
    const { fn, calls } = stubFetch([() => ok()])
    await expect(
      new ExplorerClient(fn).lookup({ db: 'player', fen: FEN }, 'tok'),
    ).rejects.toBeInstanceOf(ExplorerNeedsPlayerError)
    expect(calls).toHaveLength(0)
  })

  it('takes the last line of the stream as the answer', async () => {
    // Every line is a whole result; the last is the finished one. The blank
    // lines are the keep-alives the spec says to expect.
    const { fn } = stubFetch([
      () =>
        ndjson([
          '{"white":1,"draws":0,"black":0,"queuePosition":3,"moves":[]}\n',
          '\n',
          '{"white":5,"draws":1,"black":2,"moves":[{"uci":"c6d5","san":"cxd5",',
          '"averageOpponentRating":1700,"white":3,"draws":1,"black":1}]}\n',
        ]),
    ])
    const seen: number[] = []
    const result = await new ExplorerClient(fn).lookup(PLAYER, 'tok', (p) =>
      seen.push(totalGames(p)),
    )
    expect(totalGames(result)).toBe(8)
    expect(result.moves[0].san).toBe('cxd5')
    // The interim answers reach the caller as they land, so the panel fills
    // in while Lichess indexes rather than sitting blank.
    expect(seen).toEqual([1, 8])
  })

  it('reads the opponents\' rating into the same column', async () => {
    const { fn } = stubFetch([
      () =>
        ndjson([
          '{"white":1,"draws":0,"black":0,"moves":[{"uci":"c6d5","san":"cxd5",' +
            '"averageOpponentRating":2100,"performance":2150,"white":1,"draws":0,"black":0}]}\n',
        ]),
    ])
    const result = await new ExplorerClient(fn).lookup(PLAYER, 'tok')
    // /player reports averageOpponentRating where the others report
    // averageRating, and it is the number that means something there.
    expect(result.moves[0].averageRating).toBe(2100)
  })

  it('splits a line that arrives in two chunks', async () => {
    const { fn } = stubFetch([
      () => ndjson(['{"white":2,"draws', '":0,"black":1,"moves":[]}\n']),
    ])
    const result = await new ExplorerClient(fn).lookup(PLAYER, 'tok')
    expect(totalGames(result)).toBe(3)
  })

  it('keeps the queue position while it is waiting to be indexed', async () => {
    const { fn } = stubFetch([
      () => ndjson(['{"white":0,"draws":0,"black":0,"queuePosition":7,"moves":[]}\n']),
    ])
    const result = await new ExplorerClient(fn).lookup(PLAYER, 'tok')
    expect(result.queuePosition).toBe(7)
  })

  it('is a different question per player, per colour', async () => {
    const { fn } = stubFetch([() => ndjson(['{"white":1,"draws":0,"black":0,"moves":[]}\n'])])
    const client = new ExplorerClient(fn)
    await client.lookup(PLAYER, 'tok')
    expect(client.cached(PLAYER)).not.toBeNull()
    expect(client.cached({ ...PLAYER, color: 'white' })).toBeNull()
    expect(client.cached({ ...PLAYER, player: 'someone-else' })).toBeNull()
  })
})
