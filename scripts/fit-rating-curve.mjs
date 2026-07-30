// Merge calibration shards, derive candidate skill metrics from the raw evals,
// and fit rating = f(metric). Compares metrics honestly (correlation, R², MAE,
// per-band bias) so the chosen curve's real precision is visible.
//
//   node scripts/fit-rating-curve.mjs shard-*.json
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/fit-rating-curve.mjs <shard.json ...>')
  process.exit(1)
}

const CP_CLAMP = 1000
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

const scoreCp = (s) => {
  if (s.mate != null) return s.mate > 0 ? CP_CLAMP : -CP_CLAMP
  return Math.max(-CP_CLAMP, Math.min(CP_CLAMP, s.cp ?? 0))
}
// Same win model as src/lib/engine/analysis.ts.
const winPct = (s) => {
  if (s.mate != null) return s.mate > 0 ? 100 : 0
  const cp = Math.max(-1500, Math.min(1500, s.cp ?? 0))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}
const moveAccuracy = (loss) =>
  Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))

// ---- Load raw games and derive per-player metrics ----
const games = []
let engine = null
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  engine ??= data.engine
  games.push(...data.samples)
}

const players = []
for (const game of games) {
  const { colors, evals, whiteElo, blackElo } = game
  if (!colors || !evals || evals.length !== colors.length + 1) continue

  for (const color of ['w', 'b']) {
    const rating = color === 'w' ? whiteElo : blackElo
    if (!rating) continue

    const cpls = []
    const winLosses = []
    const winLossesUndecided = []
    colors.forEach((moverColor, i) => {
      if (moverColor !== color) return
      const before = evals[i]
      const after = evals[i + 1]
      const sign = color === 'w' ? 1 : -1
      const cpl = Math.max(0, sign * (scoreCp(before) - scoreCp(after)))
      const wBefore = winPct(before)
      const wAfter = winPct(after)
      const winLoss = Math.max(0, sign * (wBefore - wAfter))
      cpls.push(cpl)
      winLosses.push(winLoss)
      // Positions that are not already decided (either side still has a real
      // game): raw cp loss is only meaningful here.
      if (Math.abs(scoreCp(before)) <= 400) winLossesUndecided.push(winLoss)
    })
    if (cpls.length < 15) continue

    players.push({
      rating,
      plies: cpls.length,
      acpl: mean(cpls),
      // Capped CPL: ignore catastrophic single-move swings that dominate the mean.
      acplCapped: mean(cpls.map((c) => Math.min(300, c))),
      medianCpl: median(cpls),
      awl: mean(winLosses), // average win-% loss
      awlUndecided: winLossesUndecided.length >= 10 ? mean(winLossesUndecided) : null,
      accuracy: mean(winLosses.map(moveAccuracy)),
    })
  }
}

console.log(`engine: depth ${engine?.depth}, cap ${engine?.movetimeCapMs}ms, ${engine?.build}`)
console.log(`games ${games.length}, player-samples ${players.length}\n`)

// ---- Fit helpers ----
function pearson(xs, ys) {
  const xbar = mean(xs)
  const ybar = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xbar) * (ys[i] - ybar)
    dx += (xs[i] - xbar) ** 2
    dy += (ys[i] - ybar) ** 2
  }
  return num / Math.sqrt(dx * dy)
}

/** Least-squares fit of rating = a - b*ln(metric). */
function fitLog(xs, ys) {
  const lxs = xs.map((x) => Math.log(Math.max(0.5, x)))
  const xbar = mean(lxs)
  const ybar = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < lxs.length; i++) {
    num += (lxs[i] - xbar) * (ys[i] - ybar)
    den += (lxs[i] - xbar) ** 2
  }
  const slope = num / den
  return { a: ybar - slope * xbar, b: -slope }
}

function scoreModel(xs, ys, predict) {
  const ybar = mean(ys)
  let ssRes = 0
  let ssTot = 0
  let absErr = 0
  for (let i = 0; i < xs.length; i++) {
    const p = predict(xs[i])
    ssRes += (ys[i] - p) ** 2
    ssTot += (ys[i] - ybar) ** 2
    absErr += Math.abs(ys[i] - p)
  }
  return { r2: 1 - ssRes / ssTot, mae: absErr / xs.length }
}

const METRICS = ['acpl', 'acplCapped', 'medianCpl', 'awl', 'awlUndecided', 'accuracy']

console.log('=== Metric comparison (rating = a - b*ln(metric)) ===')
const results = []
for (const metric of METRICS) {
  const rows = players.filter((p) => p[metric] != null && Number.isFinite(p[metric]))
  if (rows.length < 20) {
    console.log(`${metric.padEnd(13)} too few samples (${rows.length})`)
    continue
  }
  const xs = rows.map((p) => p[metric])
  const ys = rows.map((p) => p.rating)
  const fit = fitLog(xs, ys)
  const predict = (x) => fit.a - fit.b * Math.log(Math.max(0.5, x))
  const { r2, mae } = scoreModel(xs, ys, predict)
  const r = pearson(
    xs.map((x) => Math.log(Math.max(0.5, x))),
    ys,
  )
  results.push({ metric, fit, r2, mae, r, rows, predict })
  console.log(
    `${metric.padEnd(13)} n=${String(rows.length).padStart(3)}  r(log)=${r.toFixed(3).padStart(6)}  R2=${r2.toFixed(3).padStart(6)}  MAE=${Math.round(mae).toString().padStart(3)}  a=${fit.a.toFixed(0)} b=${fit.b.toFixed(0)}`,
  )
}

if (results.length === 0) {
  console.log('\nNo metric had enough samples.')
  process.exit(0)
}

const best = results.reduce((a, b) => (a.r2 >= b.r2 ? a : b))
console.log(`\nBest metric: ${best.metric}  (R2 ${best.r2.toFixed(3)}, MAE ${Math.round(best.mae)})`)
console.log(`  rating = ${best.fit.a.toFixed(0)} - ${best.fit.b.toFixed(0)} * ln(${best.metric})`)

console.log(`\n=== ${best.metric} by rating band (the underlying signal) ===`)
for (let lo = 600; lo < 2600; lo += 200) {
  const band = best.rows.filter((p) => p.rating >= lo && p.rating < lo + 200)
  if (band.length === 0) continue
  const vals = band.map((p) => p[best.metric])
  const errs = band.map((p) => best.predict(p[best.metric]) - p.rating)
  console.log(
    `  ${lo}-${lo + 199}: n=${String(band.length).padStart(2)}  median ${median(vals).toFixed(1).padStart(6)}  range ${Math.min(...vals).toFixed(1)}-${Math.max(...vals).toFixed(1)}  bias ${mean(errs) > 0 ? '+' : ''}${mean(errs).toFixed(0)}`,
  )
}

console.log(`\n=== Predicted rating vs ${best.metric} ===`)
const probe =
  best.metric === 'accuracy'
    ? [40, 50, 60, 70, 80, 85, 90, 95]
    : best.metric.includes('awl')
      ? [1, 2, 3, 5, 8, 12, 18, 25]
      : [10, 15, 20, 30, 40, 60, 80, 120]
for (const v of probe) {
  console.log(`  ${String(v).padStart(4)} → ${Math.round(best.predict(v))}`)
}
