// Calibrate the ACPL -> "played like" rating curve against games of known
// rating. Runs the SAME engine settings and the SAME centipawn-loss math the
// app uses (see REVIEW_DEPTH / REVIEW_MOVETIME_CAP_MS and scoreCp in
// src/lib/engine/analysis.ts), so the fitted curve applies to app output.
//
//   node scripts/calibrate-rating.mjs <gamesPgn> [outJson]
//
// Emits per-player {rating, acpl} samples plus fitted curve parameters.
import { readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { createEngine } from './lib/node-engine.mjs'

// Keep in sync with src/lib/engine/analysis.ts.
const REVIEW_DEPTH = 20
const REVIEW_MOVETIME_CAP_MS = 2500
const CP_CLAMP = 1000

const scoreCp = (score) => {
  if (score.mate != null) return score.mate > 0 ? CP_CLAMP : -CP_CLAMP
  return Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp ?? 0))
}

const gamesFile = process.argv[2]
const outJson = process.argv[3] ?? 'calibration-results.json'
if (!gamesFile) {
  console.error('usage: node scripts/calibrate-rating.mjs <gamesPgn> [outJson]')
  process.exit(1)
}

const tag = (pgn, name) => {
  const m = new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(pgn)
  return m ? m[1] : null
}

const games = readFileSync(gamesFile, 'utf8')
  .split(/\n\n(?=\[Event )/)
  .map((g) => g.trim())
  .filter((g) => g.startsWith('[Event '))

console.log(`Calibrating on ${games.length} games at depth ${REVIEW_DEPTH} (cap ${REVIEW_MOVETIME_CAP_MS}ms)`)

const engine = await createEngine({ hashMb: 64 })
const samples = []
const startedAt = Date.now()

for (const [gi, pgn] of games.entries()) {
  const whiteElo = Number(tag(pgn, 'WhiteElo'))
  const blackElo = Number(tag(pgn, 'BlackElo'))
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (e) {
    console.warn(`  game ${gi + 1}: unreadable (${e.message})`)
    continue
  }
  const history = chess.history({ verbose: true })
  if (history.length < 30) continue

  // Positions before every move, plus the final position.
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

  // Mover-perspective centipawn loss per ply, exactly as the app computes it.
  const losses = { w: [], b: [] }
  history.forEach((move, i) => {
    const before = scoreCp(evals[i])
    const after = scoreCp(evals[i + 1])
    const isWhite = move.color === 'w'
    const cpl = Math.max(0, isWhite ? before - after : after - before)
    losses[isWhite ? 'w' : 'b'].push(cpl)
  })

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const wAcpl = mean(losses.w)
  const bAcpl = mean(losses.b)
  if (whiteElo && wAcpl != null) samples.push({ rating: whiteElo, acpl: wAcpl, plies: losses.w.length })
  if (blackElo && bAcpl != null) samples.push({ rating: blackElo, acpl: bAcpl, plies: losses.b.length })

  const elapsed = (Date.now() - startedAt) / 1000
  console.log(
    `  [${gi + 1}/${games.length}] ${history.length} plies | W ${whiteElo} acpl ${wAcpl?.toFixed(1)} | B ${blackElo} acpl ${bAcpl?.toFixed(1)} | ${elapsed.toFixed(0)}s elapsed`,
  )
}

engine.quit()

// ---- Fit: rating = A * exp(-k * acpl) via least squares on log(rating) ----
// Also fit the inverse-style model rating = C / (acpl + d) for comparison.
const n = samples.length
const xs = samples.map((s) => s.acpl)
const ys = samples.map((s) => s.rating)

function fitExponential(xs, ys) {
  const lys = ys.map(Math.log)
  const xbar = xs.reduce((a, b) => a + b, 0) / xs.length
  const ybar = lys.reduce((a, b) => a + b, 0) / lys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xbar) * (lys[i] - ybar)
    den += (xs[i] - xbar) ** 2
  }
  const slope = num / den
  const intercept = ybar - slope * xbar
  return { A: Math.exp(intercept), k: -slope }
}

function r2(predict) {
  const ybar = ys.reduce((a, b) => a + b, 0) / ys.length
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < xs.length; i++) {
    ssRes += (ys[i] - predict(xs[i])) ** 2
    ssTot += (ys[i] - ybar) ** 2
  }
  return 1 - ssRes / ssTot
}

function mae(predict) {
  let total = 0
  for (let i = 0; i < xs.length; i++) total += Math.abs(ys[i] - predict(xs[i]))
  return total / xs.length
}

const expFit = fitExponential(xs, ys)
const expPredict = (acpl) => expFit.A * Math.exp(-expFit.k * acpl)

// Grid-search the rational model rating = C / (acpl + d).
let best = null
for (let d = 1; d <= 120; d += 0.5) {
  // Least-squares C for fixed d.
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    const basis = 1 / (xs[i] + d)
    num += ys[i] * basis
    den += basis * basis
  }
  const C = num / den
  const predict = (acpl) => C / (acpl + d)
  const score = r2(predict)
  if (!best || score > best.r2) best = { C, d, r2: score, mae: mae(predict) }
}

const report = {
  generatedAt: new Date().toISOString(),
  engine: { depth: REVIEW_DEPTH, movetimeCapMs: REVIEW_MOVETIME_CAP_MS, build: 'stockfish-18-lite-single' },
  source: 'Lichess public API — rated rapid games, |rating gap| <= 400, 20-70 full moves',
  sampleCount: n,
  ratingRange: [Math.min(...ys), Math.max(...ys)],
  acplRange: [Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1)].map(Number),
  exponential: { ...expFit, r2: r2(expPredict), mae: mae(expPredict) },
  rational: best,
  samples,
}

writeFileSync(outJson, JSON.stringify(report, null, 2))

console.log('\n=== Fit results ===')
console.log(`samples: ${n}, ratings ${report.ratingRange[0]}-${report.ratingRange[1]}, acpl ${report.acplRange[0]}-${report.acplRange[1]}`)
console.log(
  `exponential  rating = ${expFit.A.toFixed(0)} * exp(-${expFit.k.toFixed(5)} * acpl)   R2 ${report.exponential.r2.toFixed(3)}  MAE ${report.exponential.mae.toFixed(0)}`,
)
console.log(
  `rational     rating = ${best.C.toFixed(0)} / (acpl + ${best.d})                R2 ${best.r2.toFixed(3)}  MAE ${best.mae.toFixed(0)}`,
)
console.log('\nPredictions:')
for (const acpl of [10, 20, 30, 50, 80, 120, 200]) {
  console.log(
    `  acpl ${String(acpl).padStart(3)} → exp ${Math.round(expPredict(acpl))}, rational ${Math.round(best.C / (acpl + best.d))}`,
  )
}
console.log(`\nWrote ${outJson}`)
process.exit(0)
