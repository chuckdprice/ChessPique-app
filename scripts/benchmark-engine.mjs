// Measure what depth the bundled engine reaches per time budget, and how long
// fixed-depth searches take, so the batch-analysis budget is an informed choice.
import { createEngine } from './lib/node-engine.mjs'

const POSITIONS = [
  // Opening, middlegame, tactical, and endgame positions.
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r2q1rk1/pp1bbppp/2np1n2/2p1p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 10',
  'r3k2r/pbppqpb1/1pn3p1/7p/1n2pPP1/1PP1PN2/PB1P2P1/R2QKB1R w KQkq - 0 12',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 30',
]

const engine = await createEngine({ hashMb: 64 })

console.log('=== Fixed time budgets: depth reached ===')
for (const movetimeMs of [300, 600, 1000, 2000]) {
  const depths = []
  let totalNps = 0
  for (const fen of POSITIONS) {
    const r = await engine.analyze({ fen, movetimeMs })
    depths.push(r.depth)
    totalNps += r.nps
  }
  const avg = depths.reduce((a, b) => a + b, 0) / depths.length
  console.log(
    `movetime ${String(movetimeMs).padStart(4)}ms → depths [${depths.join(', ')}] avg ${avg.toFixed(1)}, avg nps ${Math.round(totalNps / POSITIONS.length).toLocaleString()}`,
  )
}

console.log('\n=== Fixed depths: time taken (ms) ===')
for (const depth of [12, 14, 16, 18]) {
  const times = []
  for (const fen of POSITIONS) {
    const t0 = performance.now()
    await engine.analyze({ fen, depth })
    times.push(Math.round(performance.now() - t0))
  }
  const total = times.reduce((a, b) => a + b, 0)
  console.log(
    `depth ${depth} → times [${times.join(', ')}] avg ${Math.round(total / times.length)}ms, max ${Math.max(...times)}ms`,
  )
}

engine.quit()
process.exit(0)
