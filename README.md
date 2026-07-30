# ChessNoteR PGN Converter

A static web app that converts PGN files exported by the [ChessNoteR](https://chessnoter.com)
e-notation device into standard PGNs that Lichess and Chess.com can use.

ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}` and occasional bare
clock readings like `{56:00}`. This app converts them into one `{[%clk h:mm:ss]}` comment
per move, normalizes the `TimeControl` tag (for example `G70/d10` → `4200d10`), and lets you:

- Paste a PGN or upload/drop the `.pgn` file (uploads convert immediately)
- Step through the game on a board with arrow buttons, the move list, or ← → keys, and flip
  the board to either player's perspective
- Edit every PGN tag before downloading
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

When a game loads, every position is evaluated (300 ms each) to produce:

- **Move classification** — the engine's own move is *Best*; otherwise the move is graded by
  how much win probability it gave up: ≤2% *Excellent*, ≤5% *Good*, ≤10% *Inaccuracy*,
  ≤20% *Mistake*, above that *Blunder*.
- **Accuracy** per move and per player, split by game phase (opening / middlegame / endgame).
- **"Played like" rating**, estimated from average centipawn loss and shown after each
  player's own rating: `Price, Chuck (719 / ~1900)`.

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
