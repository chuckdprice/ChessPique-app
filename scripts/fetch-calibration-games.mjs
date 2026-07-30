// Collect a rating-stratified sample of public Lichess RAPID games (the closest
// analogue to the OTB classical games ChessNoteR records) for calibrating the
// ACPL -> "played like" rating curve.
//
//   node scripts/fetch-calibration-games.mjs [outFile] [gamesPerBand]
//
// Read-only use of the public Lichess API; output is a local PGN file.
import { writeFileSync } from 'node:fs'

const outFile = process.argv[2] ?? 'calibration-games.pgn'
const perBand = Number(process.argv[3] ?? 8)

const MIN_FULL_MOVES = 20
const MAX_FULL_MOVES = 70
const BANDS = [
  [800, 1000],
  [1000, 1200],
  [1200, 1400],
  [1400, 1600],
  [1600, 1800],
  [1800, 2000],
  [2000, 2200],
  [2200, 2600],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listRapidTournaments() {
  const res = await fetch('https://lichess.org/api/tournament', {
    headers: { Accept: 'application/json' },
  })
  const data = await res.json()
  const all = [...(data.finished ?? []), ...(data.started ?? [])]
  // Rapid = base clock >= 480s; skip variants.
  return all
    .filter((t) => (t.clock?.limit ?? 0) >= 480 && (t.variant?.key ?? 'standard') === 'standard')
    .map((t) => ({ id: t.id, name: t.fullName, players: t.nbPlayers }))
}

async function fetchTournamentPgn(id) {
  const url = `https://lichess.org/api/tournament/${id}/games?moves=true&tags=true&clocks=false&evals=false&opening=false`
  const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } })
  if (!res.ok) throw new Error(`tournament ${id}: HTTP ${res.status}`)
  return res.text()
}

function splitGames(pgnText) {
  return pgnText
    .split(/\n\n(?=\[Event )/)
    .map((g) => g.trim())
    .filter((g) => g.startsWith('[Event '))
}

function tag(pgn, name) {
  const m = new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(pgn)
  return m ? m[1] : null
}

function fullMoveCount(pgn) {
  const movetext = pgn.slice(pgn.lastIndexOf(']\n') + 2)
  const nums = movetext.match(/(\d+)\.\s/g)
  if (!nums) return 0
  return parseInt(nums[nums.length - 1], 10)
}

function isUsable(pgn) {
  if (tag(pgn, 'Variant') && tag(pgn, 'Variant') !== 'Standard') return false
  const termination = tag(pgn, 'Termination')
  if (termination && !['Normal', 'Time forfeit'].includes(termination)) return false
  const w = Number(tag(pgn, 'WhiteElo'))
  const b = Number(tag(pgn, 'BlackElo'))
  if (!w || !b) return false
  // Avoid huge rating gaps: a mismatch says little about either player's level.
  if (Math.abs(w - b) > 400) return false
  const moves = fullMoveCount(pgn)
  return moves >= MIN_FULL_MOVES && moves <= MAX_FULL_MOVES
}

function bandOf(rating) {
  return BANDS.findIndex(([lo, hi]) => rating >= lo && rating < hi)
}

const tournaments = await listRapidTournaments()
console.log(`Found ${tournaments.length} standard rapid arenas`)

const chosen = []
const bandCounts = new Array(BANDS.length).fill(0)
const seen = new Set()

for (const t of tournaments) {
  if (bandCounts.every((c) => c >= perBand)) break
  let pgnText
  try {
    pgnText = await fetchTournamentPgn(t.id)
  } catch (e) {
    console.warn(`  skip ${t.id}: ${e.message}`)
    continue
  }
  const games = splitGames(pgnText).filter(isUsable)
  let added = 0
  for (const game of games) {
    const id = tag(game, 'GameId') ?? tag(game, 'Site')
    if (seen.has(id)) continue
    const w = Number(tag(game, 'WhiteElo'))
    const b = Number(tag(game, 'BlackElo'))
    // Keep the game if either player fills a band that still needs samples.
    const bands = [bandOf(w), bandOf(b)].filter((i) => i >= 0)
    if (bands.length === 0) continue
    if (!bands.some((i) => bandCounts[i] < perBand)) continue
    seen.add(id)
    chosen.push(game)
    for (const i of bands) bandCounts[i]++
    added++
  }
  console.log(
    `  ${t.name} (${t.id}): ${games.length} usable, +${added} kept | bands ${bandCounts.join(',')}`,
  )
  await sleep(1200) // be polite to the public API
}

writeFileSync(outFile, chosen.join('\n\n') + '\n')
console.log(`\nWrote ${chosen.length} games to ${outFile}`)
BANDS.forEach(([lo, hi], i) => console.log(`  ${lo}-${hi}: ${bandCounts[i]} player-samples`))
