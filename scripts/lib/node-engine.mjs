// Minimal UCI client for running the same Stockfish build from Node, used by
// the calibration and benchmark scripts. Mirrors src/lib/engine/uci.ts.
import { createRequire } from 'node:module'
import initEngine from 'stockfish'

/**
 * Which build the calibration samples were produced with.
 *
 * Read off the installed package rather than written down. `createEngine` asks
 * for "lite-single" by name and gets whatever version is installed, so a
 * hardcoded stamp beside it says nothing and goes stale silently — it sat at
 * stockfish-18 through the upgrade to 19, which would have mislabelled every
 * sample of a re-run.
 */
export const ENGINE_BUILD = `stockfish-${
  createRequire(import.meta.url)('stockfish/package.json').version.split('.')[0]
}-lite-single`

export async function createEngine({ hashMb = 64 } = {}) {
  const engine = await initEngine('lite-single')
  const handlers = new Set()
  engine.listener = (line) => {
    for (const h of handlers) h(String(line))
  }

  const send = (cmd) => engine.sendCommand(cmd)
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
  send(`setoption name Hash value ${hashMb}`)
  send('setoption name MultiPV value 1')
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
