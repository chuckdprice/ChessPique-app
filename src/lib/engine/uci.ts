import { Chess } from 'chess.js'

/**
 * Thin promise/event wrapper around the Stockfish WASM worker speaking UCI.
 *
 * All scores are normalized to WHITE's perspective regardless of the side to
 * move in the analyzed position.
 */

/**
 * The single-threaded build, which needs nothing of the page and runs anywhere
 * — including Node, where the tests and the calibration scripts drive it.
 */
export const ENGINE_WORKER_PATH = '/stockfish/stockfish-19-lite-single.js'

/**
 * The threaded build, behind our own worker. Same Stockfish 19 and the same net
 * (nn-61e7af4bb97d, which the lite build embeds and this one fetches), so at one
 * thread the two should agree — a large disagreement means something is wrong
 * rather than something has improved.
 */
export const ISOLATED_WORKER_PATH = '/stockfish/sf-worker.js'

export const ENGINE_NAME = 'SF19'

/**
 * Whether this page may use `SharedArrayBuffer`, and therefore engine threads.
 *
 * `crossOriginIsolated` is the property the headers in vercel.json buy. It is
 * read through a function rather than captured at module load so a test can
 * exercise both paths, and because it is false in Node.
 */
export function canUseThreads(): boolean {
  return typeof globalThis.crossOriginIsolated === 'boolean' && globalThis.crossOriginIsolated
}

/** Which worker to start with. */
export function defaultWorkerPath(): string {
  return canUseThreads() ? ISOLATED_WORKER_PATH : ENGINE_WORKER_PATH
}

/** Centipawns (cp) or moves-to-mate (mate); exactly one is set. White POV. */
export interface Score {
  cp?: number
  mate?: number
}

export interface EngineLine {
  multipv: number
  depth: number
  score: Score
  /** SAN continuation from the analyzed position (best-effort). */
  pvSan: string[]
  pvUci: string[]
}

export interface EngineOptions {
  hashMb?: number
  multiPv?: number
  /** Search threads. Only meaningful on the isolated build; see settings.ts. */
  threads?: number
}

export interface AnalyzeUpdate {
  depth: number
  lines: EngineLine[]
}

export interface AnalyzeResult extends AnalyzeUpdate {
  bestMoveUci: string | null
}

export interface AnalyzeOptions {
  fen: string
  /** Time limit; with `depth` set it acts as a safety cap. */
  movetimeMs: number
  /** Optional target depth — the search stops at whichever limit hits first. */
  depth?: number
  multiPv?: number
  /**
   * Restrict the search to these root moves.
   *
   * Used to score moves the engine would not otherwise look at — a popular
   * human move it does not rank is exactly the case worth showing. Whoever
   * asks should include the engine's own best move in the list, so the
   * baseline it is compared against comes out of this same search: scores from
   * two searches can be at two depths, and comparing across them is how a
   * variation once borrowed the mainline's verdict.
   */
  searchMoves?: string[]
  onUpdate?: (update: AnalyzeUpdate) => void
}

function uciToSanLine(fen: string, pvUci: string[], maxPlies = 12): string[] {
  const chess = new Chess(fen)
  const sans: string[] = []
  for (const uci of pvUci.slice(0, maxPlies)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      })
      sans.push(move.san)
    } catch {
      break
    }
  }
  return sans
}

/** What an abandoned search resolves to: nothing found, nothing searched. */
const NOTHING: AnalyzeResult = { bestMoveUci: null, depth: 0, lines: [] }

export class Engine {
  private worker: Worker | null = null
  private lineHandlers = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private searching = false
  private initialized = false
  /**
   * Bumped by `abandon`. A search remembers the generation it was queued in and
   * skips itself if that has moved on, which is the only way to get rid of one
   * that has not started yet — `stop` can only cut short the search actually
   * running.
   */
  private generation = 0

  /**
   * Set once the threaded worker has failed to start and the single-threaded
   * one has taken over, so a later `init` does not pay the timeout again.
   */
  private fellBack = false

  constructor(private workerPath: string = defaultWorkerPath()) {}

  private send(cmd: string): void {
    this.worker?.postMessage(cmd)
  }

  private onLine(handler: (line: string) => void): () => void {
    this.lineHandlers.add(handler)
    return () => this.lineHandlers.delete(handler)
  }

  /** Wait for a line matching `match`, with a safety timeout. */
  private waitFor(match: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error('Engine timed out'))
      }, timeoutMs)
      const off = this.onLine((line) => {
        if (match(line)) {
          clearTimeout(timer)
          off()
          resolve(line)
        }
      })
    })
  }

  async init(options: EngineOptions = {}): Promise<void> {
    if (this.initialized) {
      await this.setOptions(options)
      return
    }
    try {
      await this.start(this.workerPath)
    } catch (error) {
      // The threaded build has more that can go wrong than the lite one: a
      // module worker, a nested worker for the pool, a net fetched over the
      // network. None of that is worth a dead engine, so a failure to reach
      // `uciok` drops to the build that needs none of it. The cost of getting
      // this wrong is an app that cannot analyse anything.
      if (this.fellBack || this.workerPath === ENGINE_WORKER_PATH) throw error
      console.error('engine: threaded build did not start, falling back', error)
      this.fellBack = true
      this.workerPath = ENGINE_WORKER_PATH
      await this.start(ENGINE_WORKER_PATH)
    }
    await this.setOptions(options)
    this.initialized = true
  }

  /** Bring up one worker and wait for it to answer `uci`. */
  private async start(path: string): Promise<void> {
    this.worker?.terminate()
    this.worker = new Worker(path, path.endsWith('sf-worker.js') ? { type: 'module' } : undefined)
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : ''
      for (const handler of this.lineHandlers) handler(text)
    }
    // Longer than the default: this one may be downloading a 1.1 MB net on a
    // cold cache before it can answer at all.
    const uciok = this.waitFor((l) => l === 'uciok', 45000)
    this.send('uci')
    await uciok
  }

  /** Which build is actually running, for the UI and for the tests. */
  get activeWorkerPath(): string {
    return this.workerPath
  }

  async setOptions(options: EngineOptions): Promise<void> {
    if (options.hashMb != null) this.send(`setoption name Hash value ${options.hashMb}`)
    if (options.multiPv != null) this.send(`setoption name MultiPV value ${options.multiPv}`)
    // Sent unconditionally when asked for, including 1: the lite build accepts
    // `Threads 1` and ignores anything more, so there is no branch here on
    // which engine is running.
    if (options.threads != null) this.send(`setoption name Threads value ${options.threads}`)
    const ready = this.waitFor((l) => l === 'readyok')
    this.send('isready')
    await ready
  }

  /**
   * Analyze one position. Searches are serialized internally, so callers may
   * fire-and-forget; `stop()` cuts the current search short (it still resolves
   * through its bestmove).
   */
  analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const generation = this.generation
    const run = this.queue.then(() =>
      // Queued behind a search that has since been abandoned, which means the
      // position it was for is no longer on the board. Resolving with nothing
      // rather than rejecting keeps every caller's shape the same; they all
      // already ignore a result they did not ask for.
      generation === this.generation ? this.runSearch(options) : NOTHING,
    )
    // Keep the queue alive even if a search fails.
    this.queue = run.catch(() => {})
    return run
  }

  private runSearch({
    fen,
    movetimeMs,
    depth: targetDepth,
    multiPv,
    searchMoves,
    onUpdate,
  }: AnalyzeOptions): Promise<AnalyzeResult> {
    if (!this.worker) return Promise.reject(new Error('Engine not initialized'))
    const whiteToMove = fen.split(' ')[1] !== 'b'
    const lines = new Map<number, EngineLine>()
    let depth = 0

    return new Promise<AnalyzeResult>((resolve) => {
      const off = this.onLine((line) => {
        if (line.startsWith('info ') && line.includes(' pv ') && !line.includes('string')) {
          const parsed = parseInfoLine(line, whiteToMove, fen)
          if (parsed) {
            depth = Math.max(depth, parsed.depth)
            lines.set(parsed.multipv, parsed)
            onUpdate?.({ depth, lines: sortedLines(lines) })
          }
        } else if (line.startsWith('bestmove')) {
          off()
          this.searching = false
          const bestMoveUci = line.split(/\s+/)[1] ?? null
          resolve({
            bestMoveUci: bestMoveUci === '(none)' ? null : bestMoveUci,
            depth,
            lines: sortedLines(lines),
          })
        }
      })
      if (multiPv != null) this.send(`setoption name MultiPV value ${multiPv}`)
      this.send(`position fen ${fen}`)
      this.searching = true
      // Both limits may be given; Stockfish stops at whichever comes first.
      const limits = [`movetime ${Math.max(50, Math.round(movetimeMs))}`]
      if (targetDepth) limits.unshift(`depth ${targetDepth}`)
      // `searchmoves` takes every token after it, so UCI requires it last.
      if (searchMoves?.length) limits.push(`searchmoves ${searchMoves.join(' ')}`)
      this.send(`go ${limits.join(' ')}`)
    })
  }

  /** Cut the current search short; its promise resolves via bestmove. */
  stop(): void {
    if (this.searching) this.send('stop')
  }

  /**
   * Give up on everything in flight: stop the running search and skip the ones
   * still queued behind it.
   *
   * `stop` alone is not enough. Searches are serialized on one worker, so a
   * search queued for a position you have already left still had to run to its
   * movetime before the new position's could start — stepping quickly through
   * a game could put several of those in front of the move you were actually
   * looking at.
   */
  abandon(): void {
    this.generation += 1
    this.stop()
  }

  destroy(): void {
    this.send('quit')
    this.worker?.terminate()
    this.worker = null
    this.initialized = false
    this.lineHandlers.clear()
  }
}

function sortedLines(lines: Map<number, EngineLine>): EngineLine[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv)
}

function parseInfoLine(line: string, whiteToMove: boolean, fen: string): EngineLine | null {
  const tokens = line.split(/\s+/)
  let depth = 0
  let multipv = 1
  let score: Score | null = null
  let pvUci: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        depth = parseInt(tokens[++i], 10)
        break
      case 'multipv':
        multipv = parseInt(tokens[++i], 10)
        break
      case 'score': {
        const kind = tokens[++i]
        const value = parseInt(tokens[++i], 10)
        const sign = whiteToMove ? 1 : -1
        if (kind === 'cp') score = { cp: value * sign }
        else if (kind === 'mate') score = { mate: value * sign }
        break
      }
      case 'pv':
        pvUci = tokens.slice(i + 1)
        i = tokens.length
        break
    }
  }

  if (!score || pvUci.length === 0 || Number.isNaN(depth)) return null
  return { multipv, depth, score, pvUci, pvSan: uciToSanLine(fen, pvUci) }
}

/**
 * Format a white-POV score for a PGN `[%eval ...]` comment: pawns to two
 * decimals, or `#n` for mate in n — the notation lichess and chess.com write
 * and read. Unlike the on-screen form this takes no leading `+`.
 */
export function formatEvalTag(score: Score): string {
  if (score.mate != null) return `#${score.mate}`
  return ((score.cp ?? 0) / 100).toFixed(2)
}

/** Format a white-POV score for display, e.g. "+1.3", "-0.4", "M5", "-M2". */
export function formatScore(score: Score): string {
  if (score.mate != null) {
    return score.mate >= 0 ? `M${score.mate}` : `-M${-score.mate}`
  }
  const pawns = (score.cp ?? 0) / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}
