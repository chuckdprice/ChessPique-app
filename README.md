# ChessNoteR Game Analysis

A static web app for chess games and opening repertoires: it converts PGN files exported by
the [ChessNoteR](https://chessnoter.com) e-notation device into standard PGNs that Lichess and
Chess.com can use, reviews the game with Stockfish, and lets you edit the moves — including
variations — and export the result.

ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}` and occasional bare
clock readings like `{56:00}`. This app converts them into one `{[%clk h:mm:ss]}` comment
per move and normalizes the `TimeControl` tag (for example `G70/d10` → `4200d10`).

A game is held as a **tree of moves** rather than a list, so a position can have more than one
continuation. That is what makes an opening repertoire editable here: alternatives sit under
the move they answer, any of them can be promoted to the mainline, and the whole tree is read
from and written back to PGN without loss.

A game does not have to come from a file: **New game** on the menu starts an empty board, and
the moves you play on it become the game, ready to export. Everything else works the same way
on it — the engine review, the opening book, comments and variations.

The two main pages are shown as chevron tabs across the top — **PGN File → Game Analysis** —
sized so a 1440×900 desktop window needs no scrolling on either step. The button at the top
left opens a menu reaching both of them, plus **New game**, **Appearance**, **Settings** and
the help.

- **PGN File**: two panes. The left holds the game coming in, under two tabs — *Original PGN*
  (a prominent drop zone, the time-control override, the paste box and Convert) and
  *PGN Header Editor* (the tags, whose edits flow live into everything downstream). The right
  holds the `%clk` output with the switches for what goes into it above, and beneath it the
  ways out: copy, download, open on Lichess or Chess.com, or save into a Lichess study.
- **Game Analysis**: board, engine, move list, and charts in one screen.
- **Settings**: how the engine searches — search time, number of lines, memory. The same
  values as the gear on the analysis page, which stays as the shortcut for while you are
  looking at a position.
- **New game**: an empty board, seeded with the Seven Tag Roster and today's date so the file
  is valid from its first move. It asks before replacing a game that has moves in it.

### What goes into the converted PGN

Every converted game is tagged `[Annotator "https://chessnoter.vercel.app/"]`, so a file that
gets passed around says where it was made, and `ECO` / `Opening` whenever the opening is known
(see [Opening names](#opening-names)). All three are shown read-only in the *PGN Header Editor*
whether or not the source file carried them — the opening as one `ECO: Name` field, since it
comes from the moves rather than from anything typed.

A ChessNoteR export often has no tags at all, so the editor also has an **Add a tag** picker.
It offers the standard tags the game does not already carry — the Seven Tag Roster first, then
the common optional ones — and the tags the app writes itself are never in the list, because a
value typed into one would be overwritten on the way out. Choosing one adds it there and then;
it starts empty and reaches the converted PGN as soon as it has a value.

A bin beside a tag's name takes it back out of both the editor and the converted PGN, and
returns it to the picker. Only the game's own tags have one: ECO, Opening and Annotator are
written on every conversion, so removing them would last until the next keystroke.

Four switches above the converted text decide the rest — all on by default:

- **Clocks** — the `{[%clk 0:29:50]}` comments the conversion exists to produce. Off leaves the
  moves and everything else, which is occasionally what a reader wants.
- **Evals** — `[%eval 0.38]` on every move, written alongside the `%clk` comment. They appear
  once the review finishes; the switch says so while it is running.
- **Comments** — the annotator's own words from the source file, kept through the conversion,
  plus the engine's verdict on a weak move as a comment of its own:
  `{Inaccuracy. Bb5 was best.}`. Timing commands and bare clock readings are not comments and
  are always rewritten.
- **Variations** — every parenthesised line: the game's own variations, and the line the engine
  preferred after the move it replaces, `(5. Bb5 Nd7 6. Bxc6 bxc6)`. Off writes the mainline
  alone, for a reader who wants the moves as played and nothing else.

Black's reply after a bracket resumes as `5... e6`, so a reader coming out of one is never left
guessing whose move it is — and with variations off there are no brackets, so it does not.

A converted file can be fed straight back in and comes back the same, variations and all —
comments, NAGs and nesting included. (Before v2.0 the parser discarded parenthesised lines, so
a repertoire opened here lost every variation in it.)

A tag the game already carries is overwritten in place, keeping PGN's usual tag order; a tag it
lacks is appended.

On the analysis page you can:

- Step through the game with the navigation buttons (which name the previous and next moves),
  the move list, or ← → keys, and flip the board to either player's perspective. Forward follows
  the line the board is on, so walking a variation stays in it
- Choose which way to go where a position has several continuations: going forward opens a short
  list — the mainline first, then the variations — with ↑ ↓ to move through it, → to take the
  one marked, and Esc to stay put
- See each player's remaining clock beside their name (accuracy, rating and the estimated
  "played like" rating live in the Move Classification tab)
- Follow the material balance on the players' own rows: the pieces each is *up* sit just left of
  their clock, with the lead in pawns beside them — or against the board's edge when the game
  carries no clocks. Even trades cancel out, so four pawns apiece show nothing and five against
  four show one pawn
- Turn the engine on to get arrows for its top lines — shaded from best to worst — with the
  move actually played highlighted in gold
- Read the engine's verdict under every inaccuracy, mistake, and blunder in the move list. The
  line it would have played instead is added to the game as a variation of that move, so it can
  be walked with the arrow keys, promoted, or deleted like any other
- Review the game with Stockfish 18: an eval bar beside the board, per-move classification
  (Best, Inaccuracy → Blunder; Good and Excellent stay unmarked) in the move list, on the board
  and as dots on the evaluation graph, and five analysis tabs shown as icons that name
  themselves on hover — Evaluation, Phase Accuracy, Move Classification, Move Times and
  Comments. Only marked classifications are coloured in the move list (best green,
  inaccuracies blue, mistakes and blunders warmer); Good and Excellent are left plain so the
  moves worth finding stand out
- See which opening was played, named over the evaluation chart as `ECO: Name`
- Click either chart to jump the board to that move — on the Move Times chart, the left half
  of a move is White's and the right half is Black's
- Play moves yourself: drag a piece, or click it and then click where it should go — a clicked
  piece marks its legal squares, a dot to move to and a red ring around a piece it can take.
  A move played at a position that already has one is kept as a **variation** of it, listed
  under that move and never displacing what was there; a move already in the game is simply
  followed. So replaying a stored line and branching off it are the same gesture
- Right-click a move in the list — or hold it, on a touch screen — for what can be done with
  the line it starts: **Promote** moves it up one place among the alternatives, **Promote to
  mainline** makes it the game's own line all the way back to the first move, **Demote** moves
  it down, and **Delete from here** removes that move and everything after it
- Turn on the live engine panel for a continuously updating evaluation of the current
  position, with configurable search time, number of lines, and memory
- Write a note against any move on the *Comments* tab — including a move in a variation, which
  is how a repertoire's lines get their names. The move list follows as you type, and the text
  is what the converted PGN carries in braces
- See what the file could not give you: a note above the board names any variation dropped for
  containing an unplayable move, and any move whose clock had to be reused because it carried no
  elapsed time. Dismissible — neither stops the game being used
- Download the converted PGN with your edited tags

Everything — conversion and engine analysis alike — runs entirely in the browser; games are
never uploaded anywhere.

## Engine analysis

The app bundles the **single-threaded lite build of Stockfish 18 (WASM)**, copied into
`public/stockfish/` by `scripts/copy-stockfish.mjs` on `npm install`. Single-threaded means no
`SharedArrayBuffer`, so no COOP/COEP headers are needed and it deploys as a plain static site.

When a game loads, every position **on the mainline** is evaluated with a **depth-20 search**
(capped at 2.5 s per position, typically ~0.6 s) to produce:

- **Move classification** — the engine's own move is *Best*; otherwise the move is graded by
  how much win probability it gave up: ≤2% *Excellent*, ≤5% *Good*, ≤10% *Inaccuracy*,
  ≤20% *Mistake*, above that *Blunder*.
- **Accuracy** per move and per player, split by game phase (opening / middlegame / endgame).
- **"Played like" rating**, shown in the Move Classification tab under each player's own rating:
  `719 Price, Chuck (87.3%)` over `played like ~1600 Lichess Rapid`. See below for how it is
  calibrated and how much to trust it.

Variations are deliberately left out of that pass. A repertoire can hold hundreds of positions,
and reviewing all of them would pin the CPU for many minutes and start again on every edit. So
a move in a variation carries no grade or accuracy of its own — turn the live engine on and it
evaluates whatever position the board is showing, variation or not. Promoting a line to the
mainline makes a different game, and the review runs again over the one it has become.

Searched positions are remembered for as long as the tab is open, keyed by position rather than
by game, so a review only pays for what is genuinely new. Adding a move to the end of a
sixteen-move game took 21s before and 2s after.

## Human moves (Maia 3)

Stockfish answers *what is best*. **Maia-3** answers *what is tempting* — the move a human of
a given rating would actually play. The interesting case is when the two disagree: a move that a
third of 600-rated players would choose can be the one that throws the game away, and that
collision is what this overlay puts on screen.

Off by default. Switching it on in engine settings downloads a 46 MB model once and keeps it in
IndexedDB; nothing is uploaded, and if the download or the model fails the app behaves exactly
as it does with Stockfish alone. Both engines run only while the **Move Evals** pane is twisted
open — opening it starts them, closing it stops them. Open, the pane gains:

- **A column of the likeliest human moves**, with probabilities, to the left of the engine's
  lines. The two lists are independent rankings: Maia's is sorted by how likely a human is to
  play the move, Stockfish's by how good the move is. Row 3 of one has nothing to do with row 3
  of the other.
- **A colour per Maia move**, from that move's *own* Stockfish score, using the same win-%-loss
  thresholds and the same `--class-*` colours as the move list. Green is the engine's own choice;
  blue, orange and red are Inaccuracy, Mistake and Blunder. *Good* and *Excellent* stay in plain
  ink, exactly as they go unmarked in the move list.
- **One violet arrow** on the board, on Maia's single likeliest move — never a set, and never
  shaded by probability, so it never reads as another engine line. It and the played-move arrow
  are drawn thinner than the engine's and over the top of them, so a move all three agree on
  still shows all three rather than whichever was drawn last.
- **A rating**, chosen from the column's own heading (`Maia 1500: Human Moves`), from 600 to 2600
  in hundreds. It defaults to the "played like" estimate for whoever is on move, so it follows
  the level actually being played and changes with the side to move; picking a rating pins it.
  Comparing what a 1200 would play here against an 1800 is the most instructive thing it does.

Most of Maia's moves are not in the engine's top lines — that is the point — so they cannot be
coloured from the MultiPV output alone. Whatever the panel's search missed gets a second,
`searchmoves`-restricted search that also includes the engine's best move, so the baseline a move
is measured against always comes out of the same search at the same depth. This is the one place
the feature adds real engine load rather than riding along on work already being done. It gets a
fraction of the panel's search time, because it is scoring two or three named moves rather than
looking for the best one, and its depth only has to be consistent with itself. The gold ring
beside the heading shows while it runs, so a move still in plain ink reads as "not worked out
yet" rather than "unremarkable".

Maia itself does not wait for any of this. Its answer is one forward pass in its own worker —
about 65 ms, on screen at the same time as Stockfish's first line. Only the colours wait, and
they have to: the colour on a Maia move *is* a Stockfish verdict, and one taken from an
unsettled search would be wrong and then change under you.

Maia is a pure policy network: one forward pass gives a probability over the legal moves, and
there is no search behind it. Adding one would make it a worse predictor of human play.

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
  — the very thing being saved. The pop-up hands its code back over a `BroadcastChannel` (with
  a `localStorage` event as fallback) and closes itself. Not `window.opener`: the browser can
  sever that link during the round trip to Lichess, leaving the opener seeing a phantom-closed
  window and the pop-up with no one to report to — so nothing here depends on it.
- **Recognising the return**: Lichess *replaces* the redirect URI's query rather than adding to
  it (lila, `Protocol.scala`: `value.withQuery(s"code=...&state=...")`), so no marker can be
  carried on the URL. The returning document identifies itself by matching the `state` it was
  sent against the sign-in recorded as in flight; without one it treats the link as stale and
  simply boots the app.
- **The token** lives in `localStorage` until it expires or you sign out, which also revokes it
  at Lichess (`DELETE /api/token`). A rejected token is dropped and the sign-in offered again.
- **Endpoints**: `GET /api/account` for the username, `GET /api/study/by/{username}` for the
  study list (newline-delimited JSON), and `POST /api/study/{studyId}/import-pgn` to add the
  chapter. All three send `Access-Control-Allow-Origin: *`, so the browser can call them
  directly.

### Choosing the study

The list is read from the response body **as it streams**, not after it finishes: Lichess
throttles it to 50 studies a second (lila, `Study.scala`: `.throttle(if isMe then 50 else 20,
1.second)`), so a large account takes seconds to send. Studies appear in batches as they land,
behind skeleton cards until the first arrives.

Everything after that is local to the browser — search, sort, date filter, paging — so one
request serves the whole session and every interaction is instant. The list pages in as you
scroll rather than rendering hundreds of cards at once, in grid or compact-list view.

The sidebar filters by **when a study was last updated**, because that is all there is to
filter on: the endpoint returns `id`, `name`, `createdAt` and `updatedAt` and nothing else
(lila, `JsonView.metadata`). Topics, chapter counts and public/unlisted status are not part of
it, and finding them out would mean a separate request per study — the rate-limit problem this
design is avoiding.

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

## The PGN boxes

Both PGN boxes take the height left in their column, with a floor of ten lines of their own
monospace: the column has almost no height to give on a phone or a tablet, where the boxes were
coming out about four lines tall. In practice that is 10 lines on a phone held sideways, 12
upright and 19 on a tablet, and a desktop window is filled as before.

## Appearance

**Appearance** on the menu opens a dialog with three tabs — **Theme**, **Board** and
**Pieces**. Every pick previews live on the page behind the dialog; **Save** keeps it,
**Cancel** puts back whatever was showing when the dialog opened. The choice persists in
`localStorage`.

- **Theme** is a whole palette, not an accent: page, card, ink, rules and accent all move
  together. There are ten, half light and half dark. Each names a base — the light or dark
  variable block in `src/index.css`, which carries the chart, status and move-classification
  colors — and overrides the ten variables that give the app its character. `applyAppearance`
  writes those onto `<html>` as inline custom properties, which beat any stylesheet rule, so
  a theme needs no CSS of its own.
- **Board** is 24 light/dark square pairs, applied as `--board-light` / `--board-dark`.
- **Pieces** is eleven sets. *Classic* is react-chessboard's own drawing; the rest are SVG
  files under `public/piece`, loaded as `<img>` so they stay out of the bundle and get cached.

### Piece set credits

The sets other than *Classic* come from the [Lichess](https://github.com/lichess-org/lila)
project, and only sets under a permissive or attribution license are included:

| Set | Author | License |
| --- | --- | --- |
| Classic, Merida | Colin M.L. Burnett; Armando Hernandez Marroquin | GPLv2+ |
| Chessnut | Alexis Luengas | Apache 2.0 |
| Fantasy, Spatial, Celtic | Maurizio Monge | MIT |
| Rhos | RhosGFX | CC0 1.0 |
| Kiwen Suwi | neverRare | CC BY 4.0 |
| Firi | James Faure | CC BY 4.0 |
| Totoy | Kosal Sen | CC BY 4.0 |
| Papercut | Nikolay Anzarov | CC BY 4.0 |

### Engine and model credits

| Component | Author | License |
| --- | --- | --- |
| Stockfish 18 (lite, single-threaded) | The Stockfish developers | GPLv3 |
| [Maia-3](https://github.com/CSSLab/maia3) (`maia3_simplified.onnx`) | UofT Computational Social Science Lab | **AGPL-3.0** |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | Microsoft | MIT |

Maia-3 is the one dependency here under a network-copyleft license, and it is served
from this app's own origin rather than a third party — see
[`public/maia3/NOTICE.md`](public/maia3/NOTICE.md) for the attribution, the source
links and the ICLR 2026 citation. The corresponding source for this application is
this repository, which is public.

## How clocks are computed

The logic follows `chessnoter_clk_convert.py` (kept in this repo as the reference
implementation) except where noted:

- Bare clock comments (`{56:00}`) and existing `[%clk]` comments are authoritative anchors.
- **Delay** (e.g. `G70/d10`): the delay is free time, so a move costs whatever it
  spent beyond it — nothing at all if it finished within the delay.
- **Increment** (e.g. `G90+30`): the increment is paid after every move, so a move
  costs its elapsed time less the increment, and a quick one leaves the clock higher.
- Moves with no timing data reuse the previous clock and produce a warning.

The Python reference subtracts the *whole* elapsed time once a move passes the
delay or increment, which charges the bonus a second time on every such move and
compounds over a game. This app does not.

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
