# ChessPique

A static web app for reading, editing and preparing chess games. Everything runs in the
browser: the engines, the conversion and the editing all happen on your own machine, and no
game you open is ever uploaded.

It does five things:

- **Reviews** a game with Stockfish — an evaluation bar, per-move classification, accuracy by
  phase, and a "played like" rating estimate — and, beside that, what a human of a given
  rating would probably have played, from Maia-3.
- **Edits** a game as a *tree* of moves, which is what makes an opening repertoire editable
  here rather than only a game you played.
- **Prepares** an opening from the Lichess opening databases, including one opponent's own
  games from the position on the board.
- **Keeps** a library of games in your own Lichess studies — folders, tags and search over
  them — and hands one to a friend as a link that carries the whole game.
- **Converts** the PGN files exported by the [ChessNoteR](https://chessnoter.com) e-notation
  device, which is where the app started and still how most games get in.

That last one, in full: ChessNoteR writes elapsed-move-time comments like `{[%emt 0:01:23]}`
and occasional bare clock readings like `{56:00}`. ChessPique converts them into one
`{[%clk h:mm:ss]}` comment per move and normalizes the `TimeControl` tag (for example
`G70/d10` → `4200d10`), which is what Lichess and Chess.com understand.

A game is held as a **tree of moves** rather than a list, so a position can have more than one
continuation. That is what makes an opening repertoire editable here: alternatives sit under
the move they answer, any of them can be promoted to the mainline, and the whole tree is read
from and written back to PGN without loss.

A game does not have to come from a file: **New Analysis** starts an empty board, and
the moves you play on it become the game, ready to export. Everything else works the same way
on it — the engine review, the opening book, comments and variations.

The app opens on four ways in, and once any of them lands the analysis fills the screen:

- **New Analysis** — an empty board, seeded with the Seven Tag Roster and today's date so the
  file is valid from its first move.
- **Upload or Drop a .pgn File** — converts as soon as it lands. The whole page is the drop
  target.
- **Paste a PGN Game** — from Lichess, Chess.com or a ChessNoteR export, with the time-control
  override beside it.
- **Open from Lichess Study** — your library.

The button at the top left opens the menu, which carries those same four in the same order,
plus **Open Recent Study…** and **Open Recent Game…** (the last ten of each, as submenus),
**Game Analysis** to come back to the board, **Appearance**, **Settings** and the help.

**Game Analysis** is board, engine, move list and charts in one screen. Beside the board, under
four icon tabs — hover for the name — is everything about the game that is not the board
itself: *Move List*, *PGN Header* (its tags and its `#tags`), *Original PGN* (the text it was
read from, still editable and re-convertible) and *Converted PGN* (the `%clk` output, the
switches for what goes into it, and the ways out: copy, download, a share link, Lichess,
Chess.com, or save into a study).

**Settings** has three sections. *Engine* is how Stockfish searches — search time, number of
lines, memory — the same values as the gear on the engine panel. *Board* is which engines run
and what they draw, the same values as the menu at the end of the move-navigation row. *Backup*
saves and restores what only this browser knows. Both menus stay as the shortcut for while you
are looking at a position, and both close when you click anywhere else.

### What goes into the converted PGN

Every converted game is tagged `[Annotator "https://chesspique.vercel.app/"]`, so a file that
gets passed around says where it was made, and `ECO` / `Opening` whenever the opening is known
(see [Opening names](#opening-names)). All three are shown read-only in the *PGN Header* tab
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
  move actually played highlighted in gold and drawn in orange. With **Scores on arrows** on,
  every arrow carries its evaluation at the head, the played move's included — which is worth
  most exactly when that move is *not* one the engine listed
- Read the engine's verdict under every inaccuracy, mistake, and blunder in the move list. The
  line it would have played instead is added to the game as a variation of that move, so it can
  be walked with the arrow keys, promoted, or deleted like any other
- Review the game with Stockfish 18: an eval bar beside the board, per-move classification
  (Best, Inaccuracy → Blunder; Good and Excellent stay unmarked) in the move list, on the board
  and as dots on the evaluation graph, and five analysis views shown as icons that name
  themselves on hover. They sit in two panels side by side, each with its own tabs, so two are
  open at once: the left holds Evaluation, Move Times and the Opening Explorer, the right holds
  Phase Accuracy, Move Classification and Comments. Read the eval chart against the
  classification counts, or keep it open beside the comment box while writing the game up. The
  two stack on a narrow window. Only marked classifications are coloured in the move list (best green,
  inaccuracies blue, mistakes and blunders warmer); Good and Excellent are left plain so the
  moves worth finding stand out
- See which opening was played, named over the evaluation chart as `ECO: Name`
- Click either chart to jump the board to that move — on the Move Times chart, the left half
  of a move is White's and the right half is Black's. Both charts mark the move the board is
  on with a vertical line — on the Move Times chart a dashed one, with a dot on each player's
  remaining-time curve — and the Move Times chart reports its figures in a fixed row above
  the plot — time left on the left, time spent on the right — which follows the pointer's move
  as you sweep across it and falls back to the move on the board. It reads rather than
  hovering, so nothing is ever covered by the numbers describing it
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

## Opening explorer

The **Opening Explorer** tab on the left panel is the [Lichess opening
explorer](https://lichess.org/analysis#explorer) for the position on the board: the moves played
from here, how often, and how each one scored, over either the **Masters** database (OTB games
between titled players) or the **Lichess** one (rated online games). Clicking a row plays that
move into the game, so a line can be walked straight out of the database and kept as a
variation, and pointing at one lays a translucent grey arrow on the board — a shadow of the
move, drawn under the engine's own arrows rather than over them.

It needs a Lichess sign-in. Lichess added an OAuth requirement to both explorer endpoints in
early 2026, and an unauthenticated request is refused outright — so the tab offers the same
sign-in the study export uses rather than failing. No scope beyond the default is asked for,
and only the position on the board is ever sent.

A third tab, **Player**, reads one Lichess player's games instead — their repertoire from this
position and how it has scored, which is what you want when preparing for a game against
someone. Pick them from the *Personal opening explorer* dialog, which remembers the last eight
names as one-click buttons, and swap between their games as White and as Black from the header.
Lichess indexes an account on demand, so the table fills in and sharpens as the answer streams
in, saying where in the queue it is while it waits.

The gear at the right of the chart panel's tab strip carries the filters, one set per
database, matching Lichess's own: for the Lichess database, time control, average-rating band
and a `YYYY-MM` range; for the player database, time control, rated or casual, and the same
month range; for masters, a range of years — master games have no speed, rating or casual games
to filter on. The two date ranges are kept separately, so switching databases does not throw away
what you typed in the other, and a filter narrowed here re-asks rather than showing the wider
answer. The choices are saved on this device.

It is deliberately quiet with their server: one request in flight at a time as Lichess asks,
a 350ms pause before a position is looked up at all (so holding an arrow key costs nothing),
every answer cached for the life of the tab, and a full minute of silence after a 429 rather
than retrying into it.

## Human moves (Maia 3)

Stockfish answers *what is best*. **Maia-3** answers *what is tempting* — the move a human of
a given rating would actually play. The interesting case is when the two disagree: a move that a
third of 600-rated players would choose can be the one that throws the game away, and that
collision is what this overlay puts on screen.

On by default, so the 46 MB model is fetched the first time the **Move Evals** pane is opened
and kept in IndexedDB; nothing is uploaded, and if the download or the model fails the app behaves exactly
as it does with Stockfish alone. Both engines run only while the **Move Evals** pane is twisted
open — opening it starts them, closing it stops them. Open, the pane gains:

- **A column of the likeliest human moves**, each with Stockfish's score for it and how likely
  a human is to play it, to the left of the engine's lines. The two lists are independent
  rankings: Maia's is sorted by how likely a human is to play the move, Stockfish's by how good
  the move is. Row 3 of one has nothing to do with row 3 of the other. A move's score is the one
  the search that covered it returned, so a move only the constrained search reached can differ
  slightly from the same move's eval in the lines opposite; it is always the number its own
  colour was derived from. A dash means nothing has scored the move yet.
- **A colour per Maia move**, from that move's *own* Stockfish score, using the same win-%-loss
  thresholds and the same `--class-*` colours as the move list. Green is the engine's own choice;
  blue, orange and red are Inaccuracy, Mistake and Blunder. *Good* and *Excellent* stay in plain
  ink, exactly as they go unmarked in the move list.
- **A violet arrow per listed move**, faded likeliest→least the way the engine's fade
  best→worst. Under the **Maia % on arrows** switch, *every* arrow on the board carries the
  probability of a human playing it — the engine's candidates and the move actually played
  included, since Maia scores every legal move. A percentage answers a different question from a
  score, so it does not give way to one: where a square carries both, the badges stack, score
  above percentage. Maia's arrows and the played-move arrow are drawn thinner than the engine's
  and over the top of them, so a move all three agree on still shows all three rather than
  whichever was drawn last.
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

## Your library

Games are kept in your own **Lichess studies**: a study is a folder, a chapter is a game. That
choice costs no server, syncs between devices for free, backs itself up on somebody else's
infrastructure, and gives every game a public URL — and it means the games are yours, in your
account, rather than held here.

What the study API can and cannot do shapes the whole feature, so it is worth knowing:

- **There is no endpoint that lists a study's chapters.** The only way to learn what a study
  holds is to export all of it, which is why the library keeps a local copy of each study and
  re-downloads only when Lichess says it has changed.
- **There is no rename.** A chapter's name is fixed when it is imported.
- **There is no study delete on the API at all** — `POST /study/{id}/delete` is the web route,
  cookie-authenticated and without CORS, so a browser cannot reach it. Deleting a study links
  out to lichess.org.

**Refresh** re-lists your studies and re-downloads the open one. It bypasses the browser's own
cache to do it: Lichess serves a study export with a `Last-Modified` and no `Cache-Control`,
which lets a browser invent its own freshness — measured, a repeat fetch came back in 1ms
without leaving the machine, so Refresh was returning chapter names their owner had already
replaced.

**Folders** are this app's own idea, kept in this browser: Lichess has nowhere to put one. A
folder is a list you make and file studies into, empty ones included, with everything else
**Unfiled**. Rename takes its members along; deleting one unfiles its studies and touches
nothing on Lichess.

**Tags** — `#karpov`, `#dcc-2026`, `#rook-endgame` — are lowercase letters, digits and hyphens,
edited beside the PGN tags and stored in the chapter's own root comment. That is forced rather
than chosen: Lichess strips every `[%...]` command it does not maintain and discards every PGN
header outside a fixed roster, and prose is the only thing that survives. Being prose is also
why they travel with a shared link, need no storage here, and can be read and edited on
lichess.org — and why they are public on a public study. The game list filters on them, and two
tags narrow rather than widen.

**Saving** writes over the chapter you opened this session and otherwise adds a new one. The
API offers no version to check against — `POST .../moves` is a blind overwrite — so which
chapter you opened is the whole of what stands between Save and somebody else's work.

## Sharing a game

**Share link** on the *Converted PGN* tab copies a link that carries the entire game in its
fragment: `…/#/g/<base64url(gzip(pgn))>`. A 43-move game comes out at about 1300 characters,
inside the ~2000 where chat clients start breaking links.

The link *is* the game rather than a pointer to it, so it cannot break when you edit or delete
the chapter it came from, and it works from a private or unlisted study that a Lichess link
could not be read out of. The fragment is never sent to a server, so a shared game never
reaches this site's logs — and it needs no rewrite rule, which matters on a static host where
`/g/abc` would simply 404. Evals travel with it too, which a game sent through a study loses.

**View in Study** sits beside it for a game that came from a chapter, and goes to Lichess. It
is deliberately not the default: it only works for a reader when the study is public, and it
breaks when the chapter moves.

## Saving to a Lichess study

**Study** on the *Converted PGN* tab adds the game to one of your own studies as a new chapter,
using the [Studies API](https://lichess.org/api#tag/studies). It is the same sign-in the library
uses, so doing either once covers both.

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

*Original PGN* and *Converted PGN* are two tabs of the pane beside the board, and each box takes
the height left in that pane. **Analyze PGN** on the first reads the box again and replaces the
game on the board — the same door the start page uses, reached from beside the board so that an
edited tag or a corrected clock does not cost a trip back to the beginning.

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

## What is kept in your browser

Nothing is ever uploaded, so everything ChessPique remembers is remembered here, in
`localStorage`:

| Key | Holds |
| --- | --- |
| `chesspique.appearance` | theme, board colours, piece set |
| `chesspique.engine` | Stockfish's search settings, and what the board draws |
| `chesspique.explorer` | opening explorer database, filters, and the players looked up |
| `chesspique.folders` | your folders, and which study is in each |
| `chesspique.recent-games` | the last ten games opened |
| `chesspique.recent-studies` | the last ten studies opened |
| `chesspique.lichess` | the Lichess sign-in, until it expires or you sign out |

Each study you open is also cached in **IndexedDB** (`chesspique.library`) so that opening a
folder costs one download rather than one per visit. That cache is derived and never a master
copy: throwing it away costs a re-download and nothing else, and a record written by an older
version of the app is discarded rather than read.

The game on the board is not among any of it — a game lives in the tab until you export or save
it. Clearing site data resets the app to a first visit and signs you out of Lichess.

**Backup**, in Settings, writes the six keys above that are not the sign-in into a JSON file,
and reads one back. Your games are not in it and do not need to be: they are chapters in your
Lichess studies, their `#tags` are inside their own PGNs, and the study cache rebuilds itself.
The sign-in is left out deliberately — it is a live access token, and a backup is a file people
mail to themselves. The same list of keys guards the way back in, so a hand-edited backup
cannot plant a token under a name the app trusts.

These keys were `chessnoter.*` until the app was renamed on 30 August 2026. The first read
under each new name adopts whatever the old one held and removes the old key, so a rename
costs nobody their settings or their signed-in session.

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
