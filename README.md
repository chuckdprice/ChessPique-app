# ChessNoteR Game Analysis

A static web app that converts PGN files exported by the [ChessNoteR](https://chessnoter.com)
e-notation device into standard PGNs that Lichess and Chess.com can use, then reviews the
game with Stockfish.

ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}` and occasional bare
clock readings like `{56:00}`. This app converts them into one `{[%clk h:mm:ss]}` comment
per move, normalizes the `TimeControl` tag (for example `G70/d10` → `4200d10`), and lets you:

The app is a two-step flow shown as chevron tabs across the top — **PGN File → Game Analysis** —
sized so a 1440×900 desktop window needs no scrolling on either step.

- **PGN File**: four collapsible panes stacked in the order you work through them —
  *Original PGN* (paste or upload the file, with the time-control override beside the Convert
  button), *PGN Header Editor* (the tags, whose edits flow live into everything downstream),
  *Converted PGN* (the `%clk` output and the switches for what goes into it), and *Export PGN*
  (copy, download, open the game on Lichess or Chess.com, or save it into a Lichess study).
  Each opens on its own; the last three stay locked until a game has been converted, since
  until then they describe nothing.
- **Game Analysis**: board, engine, move list, and charts in one screen.

### What goes into the converted PGN

Every converted game is tagged `[Annotator "https://chessnoter.vercel.app/"]`, so a file that
gets passed around says where it was made, and `ECO` / `Opening` whenever the opening is known
(see [Opening names](#opening-names)). The name also shows in a read-only *Opening* field among
the tag fields on the left, reading `ECO: Name` — it comes from the moves, so it is shown rather
than edited.

Three switches on the *Converted PGN* tab, above the buttons that hand the file out, decide the
rest — all on by default, and all waiting on the engine review:

- **Evals** — `[%eval 0.38]` on every move, written alongside the `%clk` comment. They appear
  once the review finishes; the switch says so while it is running.
- **Comments** — the annotator's own words from the source file, kept through the conversion,
  plus the engine's verdict on a weak move as a comment of its own:
  `{Inaccuracy. Bb5 was best.}`. Timing commands and bare clock readings are not comments and
  are always rewritten.
- **Variations** — the line the engine preferred, after the move it replaces:
  `(5. Bb5 Nd7 6. Bxc6 bxc6)`. Black's reply then resumes as `5... e6`, so a reader coming out
  of the brackets is never left guessing whose move it is.

A converted file can be fed straight back in: the parser skips parenthesised lines, so the move
list that comes back is the game as played.

A tag the game already carries is overwritten in place, keeping PGN's usual tag order; a tag it
lacks is appended.

On the analysis page you can:

- Step through the game with the navigation buttons (which name the previous and next moves),
  the move list, or ← → keys, and flip the board to either player's perspective
- See each player's remaining clock and overall accuracy beside their name (their rating and
  the estimated "played like" rating live in the Move Classification tab)
- Follow the material balance in the strip beside the board: the pieces a player is *up* stack
  outward from the centre on their side, with the lead marked at the far end. Even trades cancel
  out, so four pawns apiece show nothing and five against four show one pawn
- Turn the engine on to get arrows for its top lines — shaded from best to worst — with the
  move actually played highlighted in gold
- Read the engine's verdict under every inaccuracy, mistake, and blunder in the move list, with
  the line it would have played instead
- Review the game with Stockfish 18: an eval bar beside the board, per-move classification
  (Best, Inaccuracy → Blunder; Good and Excellent stay unmarked) in the move list, on the board
  and as dots on the evaluation graph, and four analysis tabs — Evaluation,
  Phase Accuracy, Move Classification, and Move Times
- See which opening was played, named over the evaluation chart as `ECO: Name`
- Click either chart to jump the board to that move — on the Move Times chart, the left half
  of a move is White's and the right half is Black's
- Try a line by hand: drag the pieces and the board leaves the game to follow you, with the
  engine evaluating each position as you reach it. *Take back* unplays a move, *Back to game*
  returns, and so does any use of the navigation. Nothing played this way touches the game —
  the move list, the accuracies, and the exported PGN still describe the moves actually played
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
- **"Played like" rating**, shown in the Move Classification tab under each player's own rating:
  `719 Price, Chuck (87.3%)` over `played like ~1600 Lichess Rapid`. See below for how it is
  calibrated and how much to trust it.

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

## Saving to a Lichess study

*Export PGN → Lichess Study* adds the converted game to one of your own studies as a new
chapter, using the [Studies API](https://lichess.org/api#tag/studies).

Sign-in is **OAuth 2 with PKCE**, entirely in the browser. There is no server here to hold a
client secret, which is the case PKCE exists for: the app generates a random verifier per
attempt, sends only its SHA-256 hash to Lichess, and proves ownership when redeeming the code.
Lichess requires no registration for a public client — the `client_id` is just a name.

- **Scopes**: `study:read study:write` — the whole Studies API and nothing else. No games, no
  messages, no preferences.
- **The pop-up**: sign-in opens in a window of its own rather than redirecting this page. A
  top-level redirect would reload the app and discard the converted game and its engine review
  — the very thing being saved. The pop-up posts its code back to the opener and closes.
- **The token** lives in `localStorage` until it expires or you sign out, which also revokes it
  at Lichess (`DELETE /api/token`). A rejected token is dropped and the sign-in offered again.
- **Endpoints**: `GET /api/account` for the username, `GET /api/study/by/{username}` for the
  study list (newline-delimited JSON), and `POST /api/study/{studyId}/import-pgn` to add the
  chapter. All three send `Access-Control-Allow-Origin: *`, so the browser can call them
  directly.

## Opening names

The name over the evaluation chart comes from the **lichess opening book**
([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0-1.0) —
about 3,800 named lines. It is baked into `src/lib/openings.data.ts` by
`scripts/build-openings.mjs`, so nothing is fetched at build time or at run time:

```bash
node scripts/build-openings.mjs
```

The book is keyed by **position**, not by move order, so a transposition is still named
correctly — 1.Nf3 d5 2.d4 and 1.d4 d5 2.Nf3 are one opening. A game is named by the deepest
book position it reached. The data is ~420 kB, so it loads on demand rather than with the app.

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
