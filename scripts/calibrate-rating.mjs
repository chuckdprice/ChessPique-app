// Evaluate games of known rating with the SAME engine settings the app uses
// (REVIEW_DEPTH / REVIEW_MOVETIME_CAP_MS in src/lib/engine/analysis.ts) and dump
// the RAW per-ply evaluations. Engine time is the expensive part, so this stores
// evals rather than a single summary statistic — fit-rating-curve.mjs can then
// derive and compare candidate skill metrics offline for free.
//
//   node scripts/calibrate-rating.mjs <gamesPgn> <outJson> [fromIndex] [toIndex]
//
// Run several disjoint shards in parallel and fit with fit-rating-curve.mjs.
//
// The sharding rule changed when the engine gained threads: shards x threads
// must not exceed the machine's cores. Oversubscribing does not merely run
// slow, it changes the search, and a shard searched differently from the app is
// a sample that does not describe the app. With REVIEW_THREADS at 1 this is the
// old advice — shard as wide as you like. Above 1, divide.
import { readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { createEngine, ENGINE_BUILD } from './lib/node-engine.mjs'

/**
 * The app's own review settings, read out of its source.
 *
 * These three are exactly what the fitted curve is a curve *of*: a shard
 * produced at settings the app does not use is a sample that quietly describes
 * a different engine. They were duplicated here behind a "keep in sync"
 * comment, which is the arrangement that let a hardcoded `stockfish-18` stamp
 * survive the upgrade to 19.
 *
 * Scraped rather than imported because analysis.ts imports ./uci without an
 * extension, which node's ESM resolver will not follow. Scraping is uglier and
 * cannot drift; the throw is what makes a rename loud instead of silent.
 */
function reviewConstant(name) {
  const source = readFileSync(new URL('../src/lib/engine/analysis.ts', import.meta.url), 'utf8')
  const match = new RegExp(`export const ${name} = (\\d+)`).exec(source)
  if (!match) throw new Error(`calibrate-rating: ${name} not found in analysis.ts`)
  return Number(match[1])
}

const REVIEW_DEPTH = reviewConstant('REVIEW_DEPTH')
const REVIEW_MOVETIME_CAP_MS = reviewConstant('REVIEW_MOVETIME_CAP_MS')
const REVIEW_THREADS = reviewConstant('REVIEW_THREADS')
const CP_CLAMP = 1000

const scoreCp = (score) => {
  if (score.mate != null) return score.mate > 0 ? CP_CLAMP : -CP_CLAMP
  return Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp ?? 0))
}

const [gamesFile, outJson, fromArg, toArg] = process.argv.slice(2)
if (!gamesFile || !outJson) {
  console.error('usage: node scripts/calibrate-rating.mjs <gamesPgn> <outJson> [from] [to]')
  process.exit(1)
}

const tag = (pgn, name) => {
  const m = new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(pgn)
  return m ? m[1] : null
}

const allGames = readFileSync(gamesFile, 'utf8')
  .split(/\n\n(?=\[Event )/)
  .map((g) => g.trim())
  .filter((g) => g.startsWith('[Event '))

const from = Number(fromArg ?? 0)
const to = Number(toArg ?? allGames.length)
const games = allGames.slice(from, to)

console.log(
  `shard ${from}-${to}: ${games.length} games at depth ${REVIEW_DEPTH} ` +
    `(cap ${REVIEW_MOVETIME_CAP_MS}ms, ${REVIEW_THREADS} thread${REVIEW_THREADS === 1 ? '' : 's'})`,
)

const engine = await createEngine({ hashMb: 64, threads: REVIEW_THREADS })
const samples = []
const startedAt = Date.now()

for (const [gi, pgn] of games.entries()) {
  const whiteElo = Number(tag(pgn, 'WhiteElo'))
  const blackElo = Number(tag(pgn, 'BlackElo'))
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (e) {
    console.warn(`  game ${from + gi}: unreadable (${e.message})`)
    continue
  }
  const history = chess.history({ verbose: true })
  if (history.length < 30) continue

  const replay = new Chess()
  const fens = [replay.fen()]
  for (const move of history) {
    replay.move(move.san)
    fens.push(replay.fen())
  }

  const evals = []
  for (const fen of fens) {
    const probe = new Chess(fen)
    if (probe.isCheckmate()) {
      evals.push({ mate: probe.turn() === 'w' ? -1 : 1 })
    } else if (probe.isDraw()) {
      evals.push({ cp: 0 })
    } else {
      const { score } = await engine.analyze({
        fen,
        depth: REVIEW_DEPTH,
        movetimeMs: REVIEW_MOVETIME_CAP_MS,
      })
      evals.push(score)
    }
  }

  // Store the raw material: white-POV eval before every ply plus the final
  // position, and who moved. Metrics are derived downstream.
  samples.push({
    whiteElo,
    blackElo,
    colors: history.map((m) => m.color),
    evals: evals.map((e) => (e.mate != null ? { mate: e.mate } : { cp: e.cp })),
  })

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const quickAcpl = (color) =>
    mean(
      history
        .map((move, i) => {
          if (move.color !== color) return null
          const before = scoreCp(evals[i])
          const after = scoreCp(evals[i + 1])
          return Math.max(0, color === 'w' ? before - after : after - before)
        })
        .filter((v) => v != null),
    )

  // Write incrementally so a killed shard still contributes.
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        shard: [from, to],
        engine: {
          depth: REVIEW_DEPTH,
          movetimeCapMs: REVIEW_MOVETIME_CAP_MS,
          // Recorded so a shard run at the wrong count is detectable later
          // rather than silently pooled with the others.
          threads: REVIEW_THREADS,
          build: ENGINE_BUILD,
        },
        samples,
      },
      null,
      2,
    ),
  )

  console.log(
    `  [${from + gi + 1}] ${history.length} plies | W ${whiteElo} acpl ${quickAcpl('w')?.toFixed(1)} | B ${blackElo} acpl ${quickAcpl('b')?.toFixed(1)} | ${((Date.now() - startedAt) / 1000).toFixed(0)}s`,
  )
}

engine.quit()
console.log(`shard ${from}-${to}: ${samples.length} samples -> ${outJson}`)
process.exit(0)
