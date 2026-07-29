# ChessNoteR PGN Converter

A static web app that converts PGN files exported by the [ChessNoteR](https://chessnoter.com)
e-notation device into standard PGNs that Lichess and Chess.com can use.

ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}` and occasional bare
clock readings like `{56:00}`. This app converts them into one `{[%clk h:mm:ss]}` comment
per move, normalizes the `TimeControl` tag (for example `G70/d10` → `4200d10`), and lets you:

- Paste a PGN or upload/drop the `.pgn` file (uploads convert immediately)
- Step through the game on a board with arrow buttons, the move list, or ← → keys
- Edit every PGN tag before downloading
- See a time-usage chart: remaining clock per player (lines, left axis) and time spent
  per move (bars, right axis)
- Download the converted PGN with your edited tags

Conversion runs entirely in the browser; games are never uploaded anywhere.

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
