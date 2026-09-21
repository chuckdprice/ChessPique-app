# Working notes for Claude

The README covers what the app is and how it works. This file covers what a
session working on it needs to know that the code does not say.

## Verifying changes

**Verify against the real thing, not against your model of it.** Every mistake
worth remembering in this project came from confirming an assumption instead of
checking it:

- The Lichess import shipped broken because a `window.open` interception proved
  the wiring and not the behaviour (CORS rejected the request).
- A pop-up handoff was "verified" against a callback URL written by hand with a
  marker in it. Lichess *replaces* the redirect URI's query, so the real URL
  never had that marker and the feature failed twice in the field.
- Jerky preview animation was "diagnosed" as React reordering sixteen DOM nodes
  on a capture, by comparing each node's index among its siblings before and
  after. Removing one node shifts every later index by one without anything
  having moved: measured with a `MutationObserver` instead, a capture removes
  one node and moves none. The theory was wrong and would have produced the
  wrong fix — count real mutations, never positions in a list that changed
  length.

When a third-party contract matters, read the other side's source or spec.
`lila` is open source and settled several questions outright — see
`modules/oauth/src/main/Protocol.scala` and `app/controllers/Study.scala`.

### The browser pane lies about some things

It does not render while hidden, and several APIs go quiet. Confirmed by
measurement, not folklore:

| Doesn't work | Use instead |
| --- | --- |
| `IntersectionObserver` — never fires at all | measure scroll position directly |
| Programmatic `scrollTop` — fires no `scroll` event | `computer` scroll (real input) |
| `getComputedStyle` — returns stale values, even for a literal inline colour | screenshot the pixels |
| `window.open` — becomes a same-tab navigation | reason about it; test the parts |
| `navigator.clipboard.readText` — "Document is not focused" | stub `writeText` and assert its argument |
| `computer` key presses — arrows never reach the page | dispatch a `KeyboardEvent` on `window` |
| `requestAnimationFrame` — never fires while the pane is hidden, so a rAF sampling loop hangs | sample with `setTimeout`, or measure the mechanism rather than the frames |
| `computer` hover — React's `onPointerEnter` never fires from it | dispatch `pointerover` then `pointerenter` (`pointerType: 'mouse'`, `bubbles: true`) on the element |
| `computer` hover *leaving* an element — the pointer teleports, so no `mouseout` and no `onMouseLeave` | dispatch `mouseout` with a `relatedTarget` outside; `onMouseMove` itself does fire from two hovers in a row |
| Viewport size — `innerWidth`/`innerHeight` and `clientWidth`/`clientHeight` all read **0** while the pane is backgrounded | take the size from an element's rect, or treat 0 as "unknown" |
| `resize_window` fires **neither** `window.resize` nor `ResizeObserver` — the layout changes silently, so anything that re-measures on a resize looks broken | dispatch `new Event('resize')` on `window` yourself, or force a re-render, then measure |
| `ResizeObserver` — delivered with the frame, so a hidden pane gets nothing, not even the initial callback `observe()` promises | don't rely on it alone; pair it with a `resize` listener and a measure on every render |

`getBoundingClientRect` and DOM attribute reads *are* reliable. So are
screenshots. `computer` clicks and scrolls land even when the call reports a
timeout — re-query the DOM afterwards rather than assuming it failed.

The zero viewport is the nastier one, because element rects keep their real
values beside it: code that places something *relative to the viewport* gets
believable inputs and an absurd bound. Clamping a hover preview to
`innerWidth - width` pinned every one of them to the left edge, which read as a
placement bug in the app. `showPreview` in `EnginePanel` now treats a
zero-width viewport as no bound at all, and that guard is there for the pane
rather than for any real browser.

**Click coordinates go wrong after a custom `resize_window`.** They are
screenshot pixels scaled by viewport ÷ screenshot width — 1.6 at the desktop
preset. After `resize_window` with an arbitrary width the factor became 5.74
and every click landed somewhere else, silently: the drawer test looked like an
app bug for several minutes. Use the `mobile` / `tablet` / `desktop` presets,
and if a click does nothing, calibrate before debugging the app — attach a
capturing `click` listener, click a known point, and compare.

**The board can throw, and it is wrapped so that it does not take the page.**
react-chessboard measures a square to animate a move and throws "Square width
not found" when it has no layout to measure — which the browser pane does to it
regularly once it stops painting. An uncaught error unmounts the whole React
tree, so this used to blank the app mid-session and lose the game. `BoardBoundary`
catches it and clears itself when `currentId` changes, so navigating recovers.
If the app goes blank while you are testing, check the console for that message
before suspecting whatever you just changed — it reproduces on an untouched
checkout.

**The chessboard needs pointer events.** react-chessboard v5 uses dnd-kit, so
the harness's drag tool (mouse events) cannot move a piece. Drive it with a
`pointerdown` → several `pointermove` → `pointerup` sequence.

## Things that will bite

- **The engine review must never key off the game object's identity.** It costs
  about a minute, and everything about a game — including every comment — now
  lives in one `MoveTree` that a keystroke replaces. The effect depends on
  `mainlineKey` instead, a string of the mainline's UCIs: it changes when the
  moves change and not when anything else does, and React compares dependencies
  by value. Anything else that is expensive and only about the moves belongs on
  that same key. (Comment edits used to be held in a separate ply-keyed map for
  this reason; that is gone, and a ply cannot name a move in a variation anyway.)
- **A ply does not identify a position any more.** The game is a tree, so the
  cursor is a node id (`currentId`) and so are the keys of `deeperEvals`. Plies
  still name mainline moves, and the charts and accuracies still use them
  because they are only ever about the mainline — `App` translates at that one
  boundary with `mainlinePlyOf` and `nodeAtMainlinePly`. Looking analysis up by
  a ply you did not check is on the mainline is a real bug that has happened
  once: a variation move quietly borrowed the mainline's verdict at that depth.
- **The converter deliberately disagrees with `chessnoter_clk_convert.py` about
  delay and increment.** The Python reference subtracts the entire elapsed time
  once a move exceeds the bonus, which charges the bonus twice on every such
  move; over a G70/d10 game that ran Chuck's clock to zero on move 37 of a game
  he finished with 35 seconds. `applyTimeRule` now spends `emt - bonus`
  throughout. Measured against the 13 scoresheet clock readings in that game,
  the corrected rule is off by a mean 7.8s and the old one by 35.7s, always low.
  `converted_game.pgn` is a golden file of *this* app's output, so don't
  "restore" it to the Python script's numbers.
- **The Lichess study export is cached by the browser, and it must not be.**
  `GET /api/study/{id}.pgn` answers with a `Last-Modified` and **no**
  `Cache-Control`, `ETag` or `Expires` — the case where a browser is entitled
  to invent its own freshness, conventionally a tenth of the response's age. A
  study last modified months ago is therefore "fresh" for days: Refresh sent
  the request, the browser answered it from disk, and the app showed chapter
  names their owner had replaced. Measured from the running app on 9 September
  2026, four consecutive default-cache fetches took 1ms each and four with
  `cache: 'no-store'` took 468-785ms — the first four never left the machine.
  `LibraryClient` sets `no-store` on both export calls and there is a test on
  it. The *listing* needs none: it carries no validator at all, so no heuristic
  can apply. Note that a stubbed `fetch` can never catch this, which is why it
  survived a round of testing that looked thorough.
- **The "played like" curve survived Stockfish 19 — don't re-fit it without
  reading this.** `PLAYED_LIKE_A/B` in `analysis.ts` were fitted against
  Stockfish 18, so the upgrade to 19 on 21 September 2026 looked like it
  invalidated them. Measured instead of assumed: 39 fresh Lichess rapid games
  evaluated with 19 at the same depth, then the shipped curve and a re-fit
  compared on the *same* 65 player-samples — MAE **260** shipped against **258**
  re-fitted, and at both extremes the shipped one is the better of the two. Two
  Elo is not a reason to move a constant, so nothing changed. The band medians
  did rise (2000-2199: 2.5 → 3.1, 1800-1999: 2.3 → 3.4), which is what a
  stronger engine does to human moves; it is simply swamped by how weak a
  single game is as a rating signal (R² ≈ 0.31, and that is the honest ceiling).
  Two traps in the numbers: the new report's MAE 258 against the old report's
  331 is **not** an improvement — different sample, and it has no 2200+ band, so
  the narrower rating range shrinks MAE and attenuates R² by itself. And that
  missing band is why the run cannot speak for the high end at all:
  `fetch-calibration-games.mjs` samples whichever rapid arenas are *live*, and
  the ones running that day topped out at 2200. Re-run it when high-rated
  arenas are up if the top of the curve ever matters. The pipeline is
  `fetch-calibration-games.mjs` → `calibrate-rating.mjs` (shard it; the engine is
  single-threaded and it is ~0.7 s per ply) → `fit-rating-curve.mjs`.
- **Don't run `npx prettier`.** There is no config, so it applies its own
  defaults — semicolons and double quotes — and reformats an entire file against
  the house style (no semicolons, single quotes). It produced a 220-line diff
  for a 3-line change once.
- **Don't `git add -A` without reading `git status` first.** It once swept a
  personal file from the working tree into a pushed commit.
- The engine review takes roughly a minute for a 30-move game, and longer when
  the browser pane is backgrounded. Budget for it when testing anything
  downstream of `analysis`.
- **A theme is inline custom properties on `<html>`, not a stylesheet rule.**
  `applyAppearance` writes them, which is why they win over the light/dark
  blocks in `index.css`. Two consequences: every theme must set every variable
  in `ThemeVar` — one it omits is inherited from whichever theme ran before it,
  and a unit test guards this — and in the browser pane you check a theme by
  reading `document.documentElement.style`, never `getComputedStyle`.

## Maia-3

- **The 4352-move policy space is derived, not vendored.** `src/lib/maia/moves.ts` computes the
  index; `src/lib/__fixtures__/all_moves_maia3.json` is Maia's own table, and the test checks
  every one of the 4352 entries both ways. If a later model renumbers the space that test is
  what tells you, so don't delete the fixture to save 60 kB.
- **The model only ever sees White to move.** A Black-to-move position is mirrored — flipped and
  recoloured — and the answers mirrored back inside `encodePosition`, which returns UCIs in the
  caller's coordinates so nothing downstream has to remember. This is upstream's contract, read
  off `CSSLab/maia-platform-frontend` (`src/lib/engine/tensor.ts`), not something to re-derive.
- **Maia is not what you are waiting for.** Measured: its moves are on screen 121-211ms after
  arriving at a position, against Stockfish's first line at 184ms, and the forward pass itself is
  ~65ms. The wait is the colouring search, and `colourSearchMs` deliberately gives it only a
  fraction of the panel's movetime — it scores two or three named moves against a baseline from
  its own search, so its depth never has to match anything. Shortening it from 8s to 3.2s left
  the smoke test below unchanged, verdict for verdict.
- **A finished game needs the guard in two places.** Both the inference effect and the colouring
  effect test `gameOver`, and neither is redundant: on the render that arrives at a mate, `update`
  and `maiaMoves` still hold the position you came from — the nulls land a render later — so the
  colouring effect would start a search anyway and leave its ring spinning over "Thinking…" with
  nothing left to turn it off. That is the bug Chuck reported; removing either test brings it back.
- **Searches are serialized on one worker, so leaving a position must `abandon`, not `stop`.**
  `stop` only cuts short the search actually running; one still queued behind it would run its
  full movetime for a position no longer on the board. Stepping quickly through a game put
  several of those in front of the move being looked at. Measured after: navigating away from a
  running colouring search puts the new position's lines on screen in 106ms.
- **A Maia move is only ever compared against the best move from the same search.** Its colour
  needs a Stockfish score, and most of its moves are outside MultiPV, so a second
  `searchmoves` search covers the rest *and re-scores the engine's best move*. Comparing a
  constrained score against the panel's would be the mainline/variation depth mix-up again, in a
  new place.
- **Every arrow on the board can carry a Maia percentage, because Maia scores every
  legal move.** `decodePolicy` returns the whole legal-move distribution, so `EnginePanel`
  hands the full list up and `App` draws arrows for the first `multiPv` of them and looks the
  rest up by UCI for the engine's candidates and the played move. Arrows were deliberately
  one violet arrow at first — Chuck asked for the set, and they fade by rank through the
  overlay's `opacity` rather than an alpha in the colour, because `--maia` is a theme variable
  and a var cannot carry one.
- **Maia's arrow and the played-move arrow are not react-chessboard's.** That component takes one
  stroke width for every arrow and keys them by their pair of squares, so two arrows along the
  same squares are one arrow with a duplicate React key — and those two are the ones most likely
  to land on an engine candidate. `BoardViewer` draws them itself in an SVG at z-25, between the
  library's arrows and the eval labels, thinner, and steps the width down again for a second
  arrow on the same path so both colours stay visible.
- **Both lists always render `multiPv` rows, filled or not.** A new position empties them until
  the first result lands, and letting them collapse to a single "Thinking…" and spring back
  bounced the pane and everything under it on every move — it read as the pane closing and
  reopening. The waiting message lives in the first reserved row rather than above the list, so
  it costs no height of its own. Measured after the fix: constant 123px across six first-visit
  moves, sampled every 30ms.
- **The eval beside a Maia move comes from the search that scored that move, not
  from the panel's lines.** `verdictsForMoves` returns the score alongside the
  classification for exactly this reason: a move only the constrained search
  reached is graded against that search's baseline, so showing the panel's
  number next to that grade would print a verdict and a figure that disagree.
  Both number columns are fixed-width — a probability is 3.6% or 60.5% wide, and
  letting it size itself shifted the eval column beside it row by row.
- **`SettingsPopover` flips above its button when there is no room below.**
  The chart pane's gear sits at the bottom of the page: hanging downwards left
  the explorer's panel 160px tall and scrolling, measured at a 960px viewport.
  It opens upward there and downward everywhere else, which is why the place it
  computes carries either a `top` or a `bottom`, never both.
- **Two settings menus, and the split between them is deliberate.** The gear on
  the engine panel is Stockfish's search and nothing else; the hamburger at the
  right of the move-nav row is what the board draws — the arrow numbers and
  whether Maia runs at all. They were one menu under a heading carrying the
  engine's name, which is the wrong home for Maia's switch. Both hang off
  `SettingsPopover`, which owns the placement and the click-away: it ignores
  pointerdowns on its own anchor, because closing there as well as in the
  button's onClick made a second press on the gear look like it did nothing.
  The `SettingsPage` mirrors the same two groups.
- **The bottom panel is two panes, each with its own tab strip.** Charts on the
  left (Evaluation, Move Times, Opening Explorer), summaries on the right
  (Phase Accuracy, Move Classification, Comments), so a reader can have one of
  each open at once —
  that is the whole point of the split, and merging them back into one strip
  takes it away. The `@container/panels` wrapper and the `@[44rem]/panels:`
  query are deliberately on **different** elements: an element cannot query
  itself, and with both on the flex row it stayed stacked at every width,
  measured at 1232px.
- **The explorer's hover arrow is an outline, not a stroke.** Every other arrow
  on this board is a stroked path with a marker on the end, which can only ever
  be one colour; this one is filled *and* bordered, so `arrowOutline` traces the
  shaft and the head as a single closed polygon. The knight's move is the part
  that needed thought: offsetting a right-angled turn puts the join at the
  corner plus **both** normals (`n1 + n2`) on one side and its negation on the
  other, and anything less pinches the outline at the bend. Verified against the
  arithmetic in the running app on 30 August 2026 — for g1f3 the polygon's nine
  points came out exactly where the geometry says. It is drawn in its own SVG at
  z-15, under react-chessboard's arrows at z-20, because it is a shadow of a
  move nobody has played: an engine candidate along the same squares should lie
  on top of it rather than be tinted by it.
- **A badge on the board is a stack, not a value.** Two arrows can point at one
  square and mean different things — an eval and Maia's probability — and the
  labels used to be keyed by square alone, so the second one was either dropped
  or a duplicate React key. `groupBySquare` in `BoardViewer` renders a column
  per square; `App` concatenates Maia's labels after the scores so the score is
  always the badge on top. The played move's own eval is in that list too now,
  and it is the one label that comes from the review rather than from the live
  search — look it up by node id (`deeperEvals`) or by ply *only* after
  `isMainline`, or a variation borrows the mainline's number again.
- **The hover preview is fixed across and follows the row down.** Two separate bugs, one in each
  axis: anchored to the hovered move it slid sideways as you read a variation, and pinned
  entirely to the first line it covered the lines below. Its left comes from `firstTokenRef`, its
  top from the hovered `<li>`.
- **`MiniBoard` draws its pieces in id order, and lifts the one that is moving.** They are
  absolutely positioned, so for them the DOM order *is* the paint order: drawn in board order a
  piece changed place in the stack as it moved and could slide beneath a neighbour it had just
  been in front of, worst on a capture. `carryPieceIdentities` supplies the stable id; the piece
  on `move.to` gets a z-index for as long as it is travelling. Chuck confirmed on 16 August 2026
  that the slide and captures look right, so treat this as working and suspect a regression
  rather than a never-worked bug.
- **The two columns are laid out by container query, not by `sm:`.** The side column is narrow on
  a mid-size window long after `sm:` is true, and a fixed-width Maia column starved the engine's
  lines to nothing there. `@container/evals` on the wrapper and `@[22rem]/evals:` on the two
  children is what keeps them side by side only when they fit. Note that `basis-*` on a stacked
  flex column is a *height* — that one opened a 9rem hole under the Maia rows.
- The weights are **AGPL-3.0** — the only copyleft-with-network-clause thing here. Attribution
  and the ICLR 2026 citation live in `public/maia3/NOTICE.md`; keep them with the file.
- Verified live on 11 August 2026 against the sample Sicilian in this repo: at the position after
  21…d6, Maia at 600 plays exd6 33.8% (a Mistake) over the engine's b4 23.6%, and at 1500 those
  invert to b4 37.4% / exd6 9.3%. That is the feature working, and a useful smoke test.

- **`accessibilityLayer={false}` on both charts, and it has to stay off.**
  Recharts' accessibility layer gives a chart focus when it is clicked and then
  answers ArrowLeft/ArrowRight itself, walking its own tooltip index — without
  calling `preventDefault`, so the app's window-level handler runs too. One key
  press then moved two things: recharts by one *move*, the board by one *ply*.
  Click either chart and step on with the arrows and they were out of step
  immediately. That is the bug Chuck reported on the clock chart; the eval
  chart had it too and nobody had noticed. Nothing is lost by turning it off —
  the keyboard path here is the app's own, which moves the board.
- **The clock chart has exactly one indicator, and one input.** The move on the
  board draws a dashed `ReferenceLine` and two `ReferenceDot`s on the clock
  curves. There is deliberately **no `Tooltip`** on it: its cursor drew a second
  vertical line and its `activeDot` drew those same two dots, all following the
  *pointer* while the line followed the *board*. Reference marks rather than an
  overlay of our own because recharts places them with its own scales — the
  dots land on the curves without this file knowing anything about the chart's
  vertical geometry, which it could not work out honestly. The cost is that the
  line sits at the move's tick rather than the ply's half-band; the readout row
  names the exact move instead.
- **The click handler's geometry is still hand-rolled.** `plyForClockClick` in
  `gameModel.ts` works the band out from `CLOCK_PLOT_INSET` — the chart margins
  plus the two y-axis widths — because recharts will not say where a band is.
  Change either margin there and this has to follow. The box it measures must
  stay exactly the chart's box: the padding belongs on the wrapper outside it,
  or every click reads 8px off.
- **Nothing here reads recharts' active-tooltip state.** The click handler
  already avoided it because a tap that never moved a pointer leaves it empty;
  the hover readout avoids it because `onMouseMove` on the chart gave an
  undefined `activeLabel` even for a mousemove that demonstrably reached the
  element (recharts 3.1). Both compute from the pointer's x instead.
- **The clock chart reports in a fixed row, not a tooltip.** A popover
  following the pointer covered the bars it was describing — 150px of chart has
  nowhere to put one. The row above the plot shows the hovered move, falling
  back to the move on the board and saying so. Its height is fixed, because a
  row that appeared on hover would nudge the chart out from under the pointer.

## The Lichess opening explorer

- **Both endpoints need an OAuth token now.** They did not until somewhere
  between 17 December 2025 and 3 March 2026 — the published spec gained
  `security: OAuth2: []` on `/masters` and `/lichess` in that window, and an
  unauthenticated request gets a bare nginx **401**, not JSON. Any token
  satisfies it (no scope is named), so the session the study import already
  signs in for is enough. If this feature ever "breaks with a 401", check
  whether the stored session expired before suspecting the client.
- **The host is `explorer.lichess.org`.** `explorer.lichess.ovh` is the old
  name and 401s the same way, so a 401 is not evidence you have the wrong host.
- **CORS is fine, and this was checked rather than assumed** — the mistake the
  old Lichess import made. An `Authorization` header makes the request
  non-simple, so the browser preflights it; measured from the running app on
  30 August 2026, the preflight passes and a bogus token comes back as a
  readable 401. The one thing no session here could verify is an authenticated
  200: getting a token needs Chuck's own Lichess sign-in.
- **The two databases take different filters, and different *units*.**
  `/lichess` filters by speed, rating band and month (`YYYY-MM`); `/masters`
  has no speed or band at all and takes a **year** (`YYYY`). That is the spec,
  not a simplification. `ExplorerSettings` keeps both date pairs so switching
  databases does not discard what was typed in the other, and a month sent to
  masters would filter *nothing* rather than erroring — which is why
  `loadExplorerSettings` throws away a value of the wrong shape instead of
  passing it on.
- **`/player` is a stream, and that is the whole difference.** It indexes an
  account on demand and answers with newline-delimited JSON: every line is a
  complete result, the last one is the finished one, blank lines are
  keep-alives, and `queuePosition` says how many accounts are ahead of this
  one. `readNdjson` hands each line to the caller so the table fills in and
  sharpens while Lichess works, and only the final line is cached — a partial
  stream cached as an answer would be wrong for the life of the tab. It also
  reports `averageOpponentRating` where the other two report `averageRating`;
  same column, different name, and it is the opponents' rating that means
  anything there.
- **A player stream can be cut short, and has to be.** It holds the client's
  one slot for as long as indexing takes, so a newer position aborts the
  running stream rather than queueing behind it — the only case where the
  client abandons a request that is already in flight. `player` and `color`
  are both required by the spec: a player query missing them is not a wider
  query, it is a 400, so the client refuses to send one.
- **A full selection is sent as no parameter at all.** Every speed and every
  band is the endpoint's own default, so spelling the whole list out is a
  longer URL saying the same thing — and it would split the cache from the
  unfiltered answer for the same position. The filters are part of the cache
  key, so narrowing them asks again rather than showing the wider result.
- **The rate limiting is the part with tests.** Lichess asks for one request at
  a time and a full minute's silence after a 429, and says the limits are
  deliberately unpublished. `ExplorerClient` therefore holds one queue with at
  most one *waiting* job — a newer position rejects the one waiting with
  `ExplorerAbandonedError` rather than queueing behind it, which is the same
  lesson as Maia's `abandon` — caches every answer for the tab's life, and
  after a 429 refuses to send at all until the cooldown expires. The component
  adds a 350ms settle so a held arrow key queues nothing. `ExplorerClient`
  takes its `fetch`, which is what lets `explorer.test.ts` prove all of that
  without a network.

## Conventions

- No semicolons, single quotes, 2-space indent, ~96 columns.
- **Comments explain why, not what.** A comment that restates the code earns its
  deletion; one that records a constraint, a rejected alternative, or a bug that
  shaped the code earns its place. Much of this codebase's commentary is of the
  second kind — keep it that way.
- Commit messages are prose explaining the reasoning, ending with the
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line.
- Commit and push only when Chuck asks. He asks explicitly, usually right after
  reviewing.
- `npm run build && npm test` before every commit. 211 tests as of this writing;
  they cover `src/lib` only — the UI is verified in the browser.
- Commits during v2 were split by concern rather than by session, sometimes by
  rebuilding intermediate file states by hand (`git add -p` is interactive and
  unavailable here). Worth the trouble: each one builds and passes on its own.
- **Bump the version with `npm version`, never by editing `package.json`.** Only
  major and minor are read (`vite.config.ts` derives the build number from the
  commit timestamp), but the lockfile carries the version too, and hand-editing
  drifted the two apart for five minor releases before anyone noticed. Add
  `--no-git-tag-version` to leave the change uncommitted for review; without it
  npm makes the commit and tag itself, which bypasses the rule above about
  committing only when asked.

## State of play

Deployed at <https://chesspique.vercel.app> from `main` (auto-deploy on push).
The version in the header is `major.minor` from `package.json` plus a build
number derived from the commit's timestamp, so it changes on every commit.

**v2.5 gave the app a name of its own: it is called ChessPique.** It began as a
converter for ChessNoteR's `%emt` clocks and was named after them, and it has
grown into a reviewer, a repertoire editor and an opening-preparation tool.
ChessNoteR is still credited — the conversion is still there and still the way
most games get in — but the header no longer links out, and the credit lives in
the help where the conversion is explained.

It was briefly called Chessnotes, for one commit on 30 August 2026, before
settling on ChessPique the same day. Nothing but the label changed, so a
Chessnotes left anywhere is a leftover rather than a decision. The one place
the name is load-bearing is `ANNOTATOR_URL`, which every converted PGN carries:
it names the Vercel domain, and must be a domain that actually answers —
`chesspique.vercel.app` was checked live before it went in.

The localStorage keys are `chesspique.*` now too, and that was only safe
because they migrate: `readStored` in `src/lib/storage.ts` takes what the
`chessnoter.*` key held on the first read under the new name and removes the
old one. Without it the rename would have signed everybody out and reset their
settings. Do not "simplify" it back to a plain `getItem` — and do not add a new
key without going through it, or that key alone will lose its history. It can
go once no browser could still be carrying the old names, which is a date
nobody can know.

What is *not* renamed: this working directory, and every reference to the
ChessNoteR *device* and its file format, which are a real product and not this
app.

The Lichess sign-in survives a domain rename by construction: the redirect URI
is built from `window.location`, and the client id is now derived the same way
rather than naming a domain. lila does not tie the two together — its error for
a missing client id says "choose any" — so it is only the label on the consent
screen.

**v2.1 shipped on 16 August 2026.** Two tags bracket it: `v2.1.0` on the release
merge, `v2.0-final` on the last v2.0 release, which is what a rollback goes back
to (`git revert -m 1` the merge, or redeploy that tag from Vercel). `v2.0.0` and
`v1.6-final` bracket the release before it, the same way.

What v2.1 changed, in one line: Maia-3 runs beside Stockfish, so the panel shows
what a human of a given rating would probably play next to what is actually
best. The Maia-3 section above is the part worth reading before touching it.

**The model download works in production.** Chuck confirmed it against the live
site on 16 August 2026: the 46 MB first-enable fetch, the progress ring visibly
counting up rather than flashing past in a frame, and the IndexedDB cache
holding it across a reload so the second visit does not download again. That was
the one part of v2.1 no local test could reach — every other check was made
against localhost, where the fetch is instant and cannot fail — so treat that
path as working, and suspect a regression rather than a never-worked bug if it
breaks. The blast radius was always small in any case: the feature is off until
asked for, and every failure path falls back to Stockfish alone.

What v2 changed, in one line: the game became a tree of moves rather than a
list, so the app edits a game as well as converting and reviewing one. That is
what makes it usable for an opening repertoire — and v1's parser discarded
variations silently, so any repertoire opened in v1 lost them.

Three things about the review that a session should not undo:

- It covers the mainline only. Reviewing every branch of a repertoire would pin
  the CPU for minutes and start again on every edit.
- Its searches are cached by FEN for the life of the tab, so adding a move costs
  one search rather than a whole review — 21.3s against 2.0s, measured on a
  sixteen-move game.
- The engine's recommended line for a faulted move is played into the tree as a
  real variation. That is why nothing writes it into the PGN separately any
  more, and why `moveVariation` and `formatVariation` are gone.

The Lichess sign-in and study import work: Chuck confirmed the whole flow
against his own account on 6 August 2026, after the pop-up handoff was changed
to identify the return by `state` rather than by a URL marker. Treat that path
as working, and suspect a regression rather than a never-worked bug if it
breaks.

The piece sets under `public/piece` are lichess's files, and only sets under a
permissive or attribution licence are here — several of the nicest ones on
lichess are CC BY-NC-SA and were left out on purpose. The README carries the
credits; keep them in step if a set is added.

**Never built:** a Send Feedback form. It was asked for once, then interrupted
before the one open question was answered — the app is fully static, so there is
no endpoint to receive mail. A `mailto:` handoff is the only option that cannot
be abused by bots, which was the stated requirement.
