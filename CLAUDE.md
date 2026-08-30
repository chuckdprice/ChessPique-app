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
| Viewport size — `innerWidth`/`innerHeight` and `clientWidth`/`clientHeight` all read **0** while the pane is backgrounded | take the size from an element's rect, or treat 0 as "unknown" |

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

Deployed at <https://chessnoter.vercel.app> from `main` (auto-deploy on push).
The version in the header is `major.minor` from `package.json` plus a build
number derived from the commit's timestamp, so it changes on every commit.

**v2.1 shipped on 16 August 2026** and is what production serves. Work happens
on `main` again — the `v2.1` branch was merged and deleted. Two tags bracket it:
`v2.1.0` on the release merge, `v2.0-final` on the last v2.0 release, which is
what a rollback goes back to (`git revert -m 1` the merge, or redeploy that tag
from Vercel). `v2.0.0` and `v1.6-final` bracket the release before it, the same
way.

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
