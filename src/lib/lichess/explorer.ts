/**
 * The Lichess opening explorer.
 *
 * Two databases, both at `explorer.lichess.org` rather than `lichess.org`:
 * `/masters` is OTB games between titled players, `/lichess` is rated online
 * games. The contract here is read off the published OpenAPI spec
 * (lichess-org/api, doc/specs/tags/openingexplorer/*.yaml), not guessed.
 *
 * **Both endpoints require an OAuth token.** They did not until some time
 * between December 2025 and March 2026; the spec now carries `security:
 * OAuth2: []` on each, no scope named, and an unauthenticated request gets a
 * plain nginx 401 rather than JSON. Any Lichess token satisfies it, so the
 * session the study import already signs in for is enough — but signed out,
 * this feature cannot work at all, which is why the panel asks rather than
 * showing an error.
 *
 * Being a good citizen is the other half of this file. Lichess asks for one
 * request at a time and a full minute's pause after a 429, and their API tips
 * are explicit that the limits are deliberately unpublished and varied. So:
 * every call goes through one queue, the queue holds at most one waiting job,
 * answers are cached for the life of the tab, and a 429 stops the client
 * sending anything at all until the cooldown expires.
 */

const EXPLORER_ORIGIN = 'https://explorer.lichess.org'

/** Lichess's own instruction for a 429, when no Retry-After comes with it. */
export const RATE_LIMIT_COOLDOWN_MS = 60_000

/** Positions kept per tab. An opening repertoire revisits the same handful. */
const CACHE_LIMIT = 200

export type ExplorerDb = 'masters' | 'lichess' | 'player'

/** One candidate move, with the result split three ways. */
export interface ExplorerMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  averageRating: number
}

export interface ExplorerResult {
  white: number
  draws: number
  black: number
  moves: ExplorerMove[]
  /** ECO and name, when the position has one. */
  opening: { eco: string; name: string } | null
  /**
   * Player database only: how many players are being indexed ahead of this
   * one. Present while waiting, absent once the answer is real.
   */
  queuePosition?: number
  /** Player database only: true until the stream has finished indexing. */
  indexing?: boolean
}

export class ExplorerAuthError extends Error {}

/** The player database was asked for without a player to look up. */
export class ExplorerNeedsPlayerError extends Error {}

export class ExplorerRateLimitError extends Error {
  constructor(readonly retryAtMs: number) {
    super('Lichess is rate-limiting this client')
  }
}

/**
 * A request the caller has moved on from.
 *
 * Stepping through a game with the arrow keys asks for a position every few
 * hundred milliseconds; only the last one is still wanted by the time the
 * queue reaches it. Callers ignore this rather than showing it.
 */
export class ExplorerAbandonedError extends Error {}

export interface ExplorerQuery {
  db: ExplorerDb
  fen: string
  /** `/lichess` and `/player`; masters has no speeds to filter on. */
  speeds?: string[]
  /** `/lichess` only. Rating band floors, per the spec's enum. */
  ratings?: number[]
  /** `/player` only, and required there: the username and the side to look on. */
  player?: string
  color?: 'white' | 'black'
  /** `/player` only. Masters and Lichess games are all rated. */
  modes?: string[]
  /**
   * Date bounds, in the units the chosen endpoint takes: `YYYY-MM` for
   * `/lichess`, `YYYY` for `/masters`. Empty for no bound. The two differ in
   * the spec, not by choice here, and sending a month to masters filters
   * nothing rather than erroring — which is why the caller keeps them apart.
   */
  since?: string
  until?: string
}

export function explorerUrl(query: ExplorerQuery): string {
  const params = new URLSearchParams({
    fen: query.fen,
    // The game lists are not shown, and asking for none keeps the response
    // small and the server's work down. `moves` is all this panel draws.
    moves: '12',
    topGames: '0',
  })
  if (query.since) params.set('since', query.since)
  if (query.until) params.set('until', query.until)
  if (query.db !== 'masters') {
    params.set('variant', 'standard')
    // Only sent when they narrow something: the endpoint's own default is
    // every speed, band and mode, so a full list is a longer URL saying the
    // same thing — and it would split the cache from the unfiltered answer.
    if (query.speeds?.length) params.set('speeds', query.speeds.join(','))
    // Masters takes no recentGames, so it is asked of the endpoints that have it.
    params.set('recentGames', '0')
  }
  if (query.db === 'lichess' && query.ratings?.length) {
    params.set('ratings', query.ratings.join(','))
  }
  if (query.db === 'player') {
    // Both required by the spec. A player query without them is not a wider
    // query, it is a 400.
    params.set('player', query.player ?? '')
    params.set('color', query.color ?? 'white')
    if (query.modes?.length) params.set('modes', query.modes.join(','))
  }
  return `${EXPLORER_ORIGIN}/${query.db}?${params}`
}

function cacheKey(query: ExplorerQuery): string {
  return explorerUrl(query)
}

/** What the endpoints return, before it is narrowed to what the panel draws. */
interface RawResult {
  white?: number
  draws?: number
  black?: number
  queuePosition?: number
  opening?: { eco?: string; name?: string } | null
  moves?: Array<{
    uci?: string
    san?: string
    white?: number
    draws?: number
    black?: number
    averageRating?: number
    /** What `/player` calls it — the opponents' rating, not the player's. */
    averageOpponentRating?: number
  }>
}

function narrow(raw: RawResult): ExplorerResult {
  return {
    white: raw.white ?? 0,
    draws: raw.draws ?? 0,
    black: raw.black ?? 0,
    opening:
      raw.opening?.eco && raw.opening.name
        ? { eco: raw.opening.eco, name: raw.opening.name }
        : null,
    queuePosition: raw.queuePosition,
    moves: (raw.moves ?? [])
      .filter((move): move is Required<Pick<typeof move, 'uci' | 'san'>> & typeof move =>
        Boolean(move.uci && move.san),
      )
      .map((move) => ({
        uci: move.uci,
        san: move.san,
        white: move.white ?? 0,
        draws: move.draws ?? 0,
        black: move.black ?? 0,
        // `/player` reports the opponents' average rating instead; it is the
        // one that means anything there, and the column is the same column.
        averageRating: move.averageRating ?? move.averageOpponentRating ?? 0,
      })),
  }
}

export function totalGames(result: Pick<ExplorerResult, 'white' | 'draws' | 'black'>): number {
  return result.white + result.draws + result.black
}

interface Job {
  key: string
  url: string
  token: string
  /** The player database answers as a stream; the other two answer once. */
  streaming: boolean
  onPartial?: (partial: ExplorerResult) => void
  resolve: (result: ExplorerResult) => void
  reject: (error: unknown) => void
}

/**
 * Read the player database's newline-delimited stream.
 *
 * It "will start indexing on demand, immediately respond with the current
 * results, and stream more updates until indexing is complete", so every line
 * is a whole answer and the last one is the finished answer. Empty lines are
 * sent to keep the connection alive and mean nothing. Each line is handed to
 * `onPartial` as it lands, so the panel fills in while Lichess works rather
 * than sitting blank for however long that account takes.
 */
async function readNdjson(
  response: Response,
  onPartial: ((partial: ExplorerResult) => void) | undefined,
  signal: AbortSignal,
): Promise<ExplorerResult> {
  const reader = response.body?.getReader()
  if (!reader) return narrow((await response.json()) as RawResult)

  const decoder = new TextDecoder()
  let buffer = ''
  let latest: ExplorerResult | null = null

  const take = (line: string) => {
    const text = line.trim()
    if (!text) return
    latest = narrow(JSON.parse(text) as RawResult)
    onPartial?.({ ...latest, indexing: true })
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Whatever follows the last newline is a line still arriving.
      buffer = lines.pop() ?? ''
      for (const line of lines) take(line)
      // Belt and braces: aborting rejects the read above, but a partial
      // stream must never fall through to the return below and be cached as
      // though it were the finished answer.
      if (signal.aborted) throw new ExplorerAbandonedError('superseded by a newer position')
    }
    take(buffer)
  } finally {
    // Leaving the body open holds the connection, and this client only ever
    // has one — a stream nobody is reading would block every later position.
    await reader.cancel().catch(() => {})
  }

  if (!latest) throw new Error('Lichess explorer: the player stream said nothing')
  return latest
}

/**
 * The client, as a class so a test can have one that is not the app's.
 *
 * A module-level singleton would carry a poisoned cooldown from one test into
 * the next, and the queue is exactly the state worth testing.
 */
export class ExplorerClient {
  private cache = new Map<string, ExplorerResult>()
  private running: { streaming: boolean; abort: AbortController } | null = null
  /** At most one job waits. A newer one supersedes it — see ExplorerAbandoned. */
  private waiting: Job | null = null
  private cooldownUntil = 0

  constructor(private readonly doFetch: typeof fetch = (...args) => fetch(...args)) {}

  /** A cached answer, or null. Lets a caller paint before it queues anything. */
  cached(query: ExplorerQuery): ExplorerResult | null {
    return this.cache.get(cacheKey(query)) ?? null
  }

  /** Milliseconds left of a 429 cooldown; 0 when the client may send. */
  cooldownRemaining(now = Date.now()): number {
    return Math.max(0, this.cooldownUntil - now)
  }

  /**
   * @param onPartial Called for each interim answer the player database
   *   streams while it indexes. Never called for the other two, which answer
   *   once.
   */
  async lookup(
    query: ExplorerQuery,
    token: string,
    onPartial?: (partial: ExplorerResult) => void,
  ): Promise<ExplorerResult> {
    if (!token) throw new ExplorerAuthError('Sign in to Lichess to use the opening explorer')
    if (query.db === 'player' && !query.player) {
      throw new ExplorerNeedsPlayerError('Choose a Lichess player to look up')
    }

    const key = cacheKey(query)
    const hit = this.cache.get(key)
    if (hit) return hit

    if (this.cooldownRemaining() > 0) throw new ExplorerRateLimitError(this.cooldownUntil)

    return new Promise<ExplorerResult>((resolve, reject) => {
      // The one already waiting is for a position the caller has left. Telling
      // it so is kinder than leaving a promise that never settles.
      this.waiting?.reject(new ExplorerAbandonedError('superseded by a newer position'))
      this.waiting = {
        key,
        url: explorerUrl(query),
        token,
        streaming: query.db === 'player',
        onPartial,
        resolve,
        reject,
      }
      // A player stream can stay open for as long as Lichess takes to index
      // that account, and it holds the only slot while it does. A newer
      // position has to be able to cut it short, or the panel waits on an
      // answer nobody is looking at any more.
      if (this.running?.streaming) this.running.abort.abort()
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    const job = this.waiting
    if (!job) return
    this.waiting = null
    const abort = new AbortController()
    this.running = { streaming: job.streaming, abort }
    try {
      job.resolve(await this.send(job, abort.signal))
    } catch (error) {
      // A stream cut short for a newer position is not a failure to report.
      job.reject(
        abort.signal.aborted ? new ExplorerAbandonedError('superseded by a newer position') : error,
      )
    } finally {
      this.running = null
      // Whatever is waiting now arrived while that one was in flight.
      void this.pump()
    }
  }

  private async send(job: Job, signal: AbortSignal): Promise<ExplorerResult> {
    const { key, url, token, streaming } = job
    const response = await this.doFetch(url, {
      headers: {
        Accept: streaming ? 'application/x-ndjson' : 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal,
    })

    if (response.status === 429) {
      // Retry-After is in seconds when it is a number at all. Lichess's own
      // advice — wait a full minute — is the floor, not the ceiling.
      const header = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(header) && header > 0 ? header * 1000 : RATE_LIMIT_COOLDOWN_MS
      this.cooldownUntil = Date.now() + Math.max(RATE_LIMIT_COOLDOWN_MS, wait)
      // Anything still waiting would only spend the cooldown too.
      this.waiting?.reject(new ExplorerRateLimitError(this.cooldownUntil))
      this.waiting = null
      throw new ExplorerRateLimitError(this.cooldownUntil)
    }

    if (response.status === 401 || response.status === 403) {
      throw new ExplorerAuthError('Lichess did not accept the sign-in for the explorer')
    }

    if (!response.ok) throw new Error(`Lichess explorer: HTTP ${response.status}`)

    const result = streaming
      ? await readNdjson(response, job.onPartial, signal)
      : narrow((await response.json()) as RawResult)
    // Oldest out first: an opening walk revisits its own line, and the entries
    // worth keeping are the ones asked for most recently.
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, result)
    return result
  }
}

/** The app's one client, so the cache and the queue are shared by everything. */
export const explorer = new ExplorerClient()
