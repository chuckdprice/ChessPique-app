// Minimal UCI client for running the browser's Stockfish from Node, used by the
// calibration and benchmark scripts. Mirrors src/lib/engine/uci.ts.
//
// It drives `@lichess-org/stockfish-web` — the same build the app serves to an
// isolated page — rather than nmrugg's lite-single, which is what the app now
// uses only as a fallback. Calibrating with one engine and shipping another is
// the drift ENGINE_BUILD was added to make impossible after a hardcoded
// `stockfish-18` stamp survived the upgrade to 19.
//
// Node needs no cross-origin isolation to thread: SharedArrayBuffer is
// unconditional there. So `threads` works here even though the same build needs
// COOP/COEP in a browser.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const PKG = join(ROOT, 'node_modules', '@lichess-org', 'stockfish-web')
const NNUE_DIR = join(ROOT, 'public', 'nnue')

/**
 * Which build the calibration samples were produced with.
 *
 * Read off the installed package rather than written down, for the reason a
 * hardcoded stamp goes stale silently: the previous one sat at stockfish-18
 * through the upgrade to 19 and would have mislabelled every sample of a re-run.
 */
export const ENGINE_BUILD = `sf_19_smallnet@${
  require_('@lichess-org/stockfish-web/package.json').version
}`

/**
 * @param {{hashMb?: number, threads?: number, multiPv?: number}} options
 *   `threads` defaults to 1 to match REVIEW_THREADS. A calibration run at a
 *   different number produces a curve for that number and nothing else.
 */
export async function createEngine({ hashMb = 64, threads = 1, multiPv = 1 } = {}) {
  const module = await import(join(PKG, 'sf_19_smallnet.js'))
  const engine = await module.default({
    locateFile: (file) => join(PKG, file),
    printErr: () => {},
  })

  const handlers = new Set()
  engine.listen = (line) => {
    for (const h of handlers) h(String(line))
  }
  engine.onError = (message) => {
    throw new Error(`engine: ${message}`)
  }

  const send = (cmd) => engine.uci(cmd)
  const onLine = (h) => {
    handlers.add(h)
    return () => handlers.delete(h)
  }
  const waitFor = (match, timeoutMs = 120000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error('engine timeout'))
      }, timeoutMs)
      const off = onLine((line) => {
        if (match(line)) {
          clearTimeout(timer)
          off()
          resolve(line)
        }
      })
    })

  const ready = async () => {
    const p = waitFor((l) => l === 'readyok')
    send('isready')
    await p
  }

  const uciok = waitFor((l) => l === 'uciok')
  send('uci')
  await uciok

  // The net is not in the package; the build names the one it wants, and the
  // app serves that same file from public/nnue.
  for (const index of [0, 1]) {
    const name = engine.getRecommendedNnue?.(index)
    if (!name) continue
    engine.setNnueBuffer(new Uint8Array(readFileSync(join(NNUE_DIR, name))), index)
  }

  send(`setoption name Hash value ${hashMb}`)
  send(`setoption name Threads value ${threads}`)
  send(`setoption name MultiPV value ${multiPv}`)
  await ready()

  /** Search one position; returns {score:{cp|mate}, depth, bestMoveUci, nodes, nps}. */
  const analyze = async ({ fen, depth, movetimeMs }) => {
    let best = null
    let seenDepth = 0
    let nodes = 0
    let nps = 0
    const done = new Promise((resolve) => {
      const off = onLine((line) => {
        if (line.startsWith('info ') && line.includes(' pv ') && !line.includes('string')) {
          const t = line.split(/\s+/)
          let d = 0
          let score = null
          let multipv = 1
          for (let i = 1; i < t.length; i++) {
            if (t[i] === 'depth') d = parseInt(t[++i], 10)
            else if (t[i] === 'multipv') multipv = parseInt(t[++i], 10)
            else if (t[i] === 'nodes') nodes = parseInt(t[++i], 10)
            else if (t[i] === 'nps') nps = parseInt(t[++i], 10)
            else if (t[i] === 'score') {
              const kind = t[++i]
              const v = parseInt(t[++i], 10)
              score = kind === 'cp' ? { cp: v } : { mate: v }
            } else if (t[i] === 'pv') break
          }
          if (score && multipv === 1) {
            seenDepth = Math.max(seenDepth, d)
            best = score
          }
        } else if (line.startsWith('bestmove')) {
          off()
          const uci = line.split(/\s+/)[1]
          resolve({ bestMoveUci: uci === '(none)' ? null : uci })
        }
      })
    })
    send(`position fen ${fen}`)
    const limits = []
    if (depth) limits.push(`depth ${depth}`)
    if (movetimeMs) limits.push(`movetime ${movetimeMs}`)
    send(`go ${limits.join(' ') || 'depth 12'}`)
    const { bestMoveUci } = await done
    // Scores are engine-POV; normalize to white.
    const whiteToMove = fen.split(' ')[1] !== 'b'
    const sign = whiteToMove ? 1 : -1
    const score =
      best == null
        ? { cp: 0 }
        : best.cp != null
          ? { cp: best.cp * sign }
          : { mate: best.mate * sign }
    return { score, depth: seenDepth, bestMoveUci, nodes, nps }
  }

  return { analyze, quit: () => send('quit') }
}
