import { Chess } from 'chess.js'

/**
 * Thin promise/event wrapper around the Stockfish WASM worker speaking UCI.
 *
 * All scores are normalized to WHITE's perspective regardless of the side to
 * move in the analyzed position.
 */

export const ENGINE_WORKER_PATH = '/stockfish/stockfish-18-lite-single.js'
export const ENGINE_NAME = 'SF 18'

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

export class Engine {
  private worker: Worker | null = null
  private lineHandlers = new Set<(line: string) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private searching = false
  private initialized = false

  constructor(private workerPath: string = ENGINE_WORKER_PATH) {}

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

  async init(options: { hashMb?: number; multiPv?: number } = {}): Promise<void> {
    if (this.initialized) {
      await this.setOptions(options)
      return
    }
    this.worker = new Worker(this.workerPath)
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : ''
      for (const handler of this.lineHandlers) handler(text)
    }
    const uciok = this.waitFor((l) => l === 'uciok')
    this.send('uci')
    await uciok
    await this.setOptions(options)
    this.initialized = true
  }

  async setOptions(options: { hashMb?: number; multiPv?: number }): Promise<void> {
    if (options.hashMb != null) this.send(`setoption name Hash value ${options.hashMb}`)
    if (options.multiPv != null) this.send(`setoption name MultiPV value ${options.multiPv}`)
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
    const run = this.queue.then(() => this.runSearch(options))
    // Keep the queue alive even if a search fails.
    this.queue = run.catch(() => {})
    return run
  }

  private runSearch({
    fen,
    movetimeMs,
    depth: targetDepth,
    multiPv,
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
      this.send(`go ${limits.join(' ')}`)
    })
  }

  /** Cut the current search short; its promise resolves via bestmove. */
  stop(): void {
    if (this.searching) this.send('stop')
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
