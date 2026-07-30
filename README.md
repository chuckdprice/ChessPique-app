# ChessNoteR PGN Converter

A static web app that converts PGN files exported by the [ChessNoteR](https://chessnoter.com)
e-notation device into standard PGNs that Lichess and Chess.com can use.

ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}` and occasional bare
clock readings like `{56:00}`. This app converts them into one `{[%clk h:mm:ss]}` comment
per move, normalizes the `TimeControl` tag (for example `G70/d10` → `4200d10`), and lets you:

The app is a three-step flow shown as chevron tabs across the top — **PGN Upload → PGN Tags →
Game Analysis** — sized so a 1440×900 desktop window needs no scrolling on any step.

- **PGN Upload**: paste a PGN or upload/drop the `.pgn` file (uploads convert immediately).
  The source PGN sits on the left and the converted `%clk` PGN on the right, with buttons to
  download it or copy it straight to the clipboard.
- **PGN Tags**: edit every PGN tag; changes flow live into the converted PGN, the download,
  and the clipboard copy.
- **Game Analysis**: board, engine, move list, and charts in one screen.

On the analysis page you can:

- Step through the game with the navigation buttons (which name the previous and next moves),
  the move list, or ← → keys, and flip the board to either player's perspective
- See each player's remaining clock beside their name, and their rating alongside the
  estimated "played like" rating
- Turn the engine on to get arrows for its top lines — shaded from best to worst — with the
  move actually played highlighted in gold
- Review the game with Stockfish 18: an eval bar beside the board, per-move classification
  (Best → Blunder) in the move list and on the board, and three analysis tabs — Evaluation,
  Move Classification, and Move Times
- Turn on the live engine panel for a continuously updating evaluation of the current
  position, with configurable search time, number of lines, and memory
- Download the converted PGN with your edited tags

Everything — conversion and engine analysis alike — runs entirely in the browser; games are
never uploaded anywhere.

## Engine analysis

The app bundles the **single-threaded lite build of Stockfish 18 (WASM)**, copied into
`public/stockfish/` by `scripts/copy-stockfish.mjs` on `npm install`. Single-threaded means no
`SharedArrayBuffer`, so no COOP/COEP headers are needed and it deploys as a plain static site.

When a game loads, every position is evaluated with a **depth-20 search** (capped at 2.5 s per
position, typically ~0.6 s) to produce:

- **Move classification** — the engine's own move is *Best*; otherwise the move is graded by
  how much win probability it gave up: ≤2% *Excellent*, ≤5% *Good*, ≤10% *Inaccuracy*,
  ≤20% *Mistake*, above that *Blunder*.
- **Accuracy** per move and per player, split by game phase (opening / middlegame / endgame).
- **"Played like" rating**, shown after each player's own rating:
  `Price, Chuck (719 / ~1600)`. See below for how it is calibrated and how much to trust it.

### How the "played like" rating is calibrated — and its limits

The estimate comes from **average win-percentage lost per move, counting only positions that
were not already decided** (within ±4 pawns). Move quality in a decided position says little
about strength — cheap "still winning" moves and desperate lost-position moves both distort the
numbers. The curve is

```
rating = 2142 − 411 × ln(average win-% lost per move)
```

fitted against **50 rated Lichess rapid games (100 player-samples, ratings 740–2431)**,
analyzed with the exact depth-20 search this app uses. The fitting script compares candidate
metrics; this one measured best by a clear margin:

| metric | R² | MAE (Elo) |
| --- | --- | --- |
| win-% loss, undecided positions | **0.31** | **331** |
| capped centipawn loss | 0.20 | 360 |
| accuracy | 0.19 | 369 |
| raw ACPL | 0.18 | 366 |
| median centipawn loss | 0.07 | 396 |

Reproduce it with:

```bash
node scripts/fetch-calibration-games.mjs calibration-games.pgn 8
node scripts/calibrate-rating.mjs calibration-games.pgn shard-0.json 0 25
node scripts/fit-rating-curve.mjs shard-*.json
```

`calibrate-rating.mjs` stores raw per-ply evaluations, so `fit-rating-curve.mjs` can compare
candidate metrics (raw ACPL, capped ACPL, median CPL, win-% loss, accuracy) without paying for
engine time again. Two limits are inherent to the approach and worth stating plainly:

- **It is on the Lichess rapid scale.** Those ratings run higher than USCF or FIDE OTB ratings
  for the same player, so an OTB-rated player will usually see a larger number here.
- **One game is a weak rating signal.** Even the best metric reaches only R² ≈ 0.31, with a
  mean absolute error of ±331 Elo, and the fit compresses toward the middle: in the calibration
  sample it over-rated 800–1000 players by ~540 and under-rated 2200–2400 players by ~490.
  Quiet games look "strong" and sharp games look "weak" regardless of who is playing. The figure
  is therefore rounded to the nearest 100, prefixed with `~`, and explained on hover — treat it
  as a rough indicator, not a measurement. Accuracy and move classification are on much firmer
  ground.

## Appearance

The palette icon in the header opens theme settings: Light, Dark, or System (which follows
the OS setting live), plus five accent colors. Choices persist in `localStorage`.

## How clocks are computed

The logic mirrors `chessnoter_clk_convert.py` (kept in this repo as the reference
implementation):

- Bare clock comments (`{56:00}`) and existing `[%clk]` comments are authoritative anchors.
- **Delay** (e.g. `G70/d10`): a move within the delay costs nothing; otherwise the full
  elapsed time is subtracted.
- **Increment** (e.g. `G90+30`): a move within the increment adds the unused portion;
  otherwise the full elapsed time is subtracted.
- Moves with no timing data reuse the previous clock and produce a warning.

If the PGN has no usable `TimeControl` tag, the app asks for the starting time and
delay/increment via the "Time control override" fields.

## Running it locally

```bash
./start.sh
```

That installs dependencies on first run, starts the dev server, and opens the app in
your browser. Use `./start.sh --prod` to build and serve the production bundle instead,
and Ctrl+C to stop either one.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests (validates against the reference converter output)
npm run build   # production build (what Vercel runs)
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Accept the defaults — Vercel auto-detects Vite (`npm run build`, output `dist/`).

Every push to the default branch then deploys automatically.
