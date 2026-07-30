// Supplement the calibration sample by targeting specific rating bands: find
// players in a band from rating-capped arena results, then export their rated
// rapid games. Appends usable games to the given PGN file.
//
//   node scripts/fetch-band-games.mjs <outFile> <lo> <hi> <targetGames>
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const [outFile, loArg, hiArg, targetArg] = process.argv.slice(2)
if (!outFile || !loArg || !hiArg) {
  console.error('usage: node scripts/fetch-band-games.mjs <outFile> <lo> <hi> [targetGames]')
  process.exit(1)
}
const lo = Number(loArg)
const hi = Number(hiArg)
const target = Number(targetArg ?? 8)

const MIN_FULL_MOVES = 20
const MAX_FULL_MOVES = 70
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tag = (pgn, name) => {
  const m = new RegExp(`^\\[${name} "(.*)"\\]$`, 'm').exec(pgn)
  return m ? m[1] : null
}
const fullMoveCount = (pgn) => {
  const movetext = pgn.slice(pgn.lastIndexOf(']\n') + 2)
  const nums = movetext.match(/(\d+)\.\s/g)
  return nums ? parseInt(nums[nums.length - 1], 10) : 0
}
const isUsable = (pgn) => {
  if (tag(pgn, 'Variant') && tag(pgn, 'Variant') !== 'Standard') return false
  const t = tag(pgn, 'Termination')
  if (t && !['Normal', 'Time forfeit'].includes(t)) return false
  const w = Number(tag(pgn, 'WhiteElo'))
  const b = Number(tag(pgn, 'BlackElo'))
  if (!w || !b || Math.abs(w - b) > 400) return false
  // At least one player must be in the target band.
  if (!((w >= lo && w < hi) || (b >= lo && b < hi))) return false
  const moves = fullMoveCount(pgn)
  return moves >= MIN_FULL_MOVES && moves <= MAX_FULL_MOVES
}

const existing = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
const seen = new Set([...existing.matchAll(/^\[GameId "(.*)"\]$/gm)].map((m) => m[1]))

// Rating-capped arenas are the best source of low-rated players.
const listRes = await fetch('https://lichess.org/api/tournament', {
  headers: { Accept: 'application/json' },
})
const listData = await listRes.json()
const arenas = [...(listData.finished ?? []), ...(listData.started ?? [])].filter(
  (t) => (t.variant?.key ?? 'standard') === 'standard',
)

// Collect candidate usernames whose arena rating falls in the band.
const users = new Set()
for (const arena of arenas) {
  if (users.size >= 25) break
  try {
    const res = await fetch(`https://lichess.org/api/tournament/${arena.id}/results?nb=60`, {
      headers: { Accept: 'application/x-ndjson' },
    })
    const text = await res.text()
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      if (row.rating >= lo && row.rating < hi && row.username) users.add(row.username)
    }
  } catch {
    /* skip arena */
  }
  await sleep(800)
}
console.log(`band ${lo}-${hi}: ${users.size} candidate players`)

let kept = 0
for (const username of users) {
  if (kept >= target) break
  try {
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?perfType=rapid&rated=true&max=6&moves=true&tags=true&clocks=false&evals=false&opening=false`
    const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } })
    if (!res.ok) {
      await sleep(2000)
      continue
    }
    const text = await res.text()
    const games = text
      .split(/\n\n(?=\[Event )/)
      .map((g) => g.trim())
      .filter((g) => g.startsWith('[Event '))
    for (const game of games) {
      if (kept >= target) break
      const id = tag(game, 'GameId')
      if (!id || seen.has(id) || !isUsable(game)) continue
      seen.add(id)
      appendFileSync(outFile, '\n\n' + game)
      kept++
    }
  } catch {
    /* skip user */
  }
  await sleep(1200)
}
console.log(`band ${lo}-${hi}: appended ${kept} games`)
