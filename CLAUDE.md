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

`getBoundingClientRect` and DOM attribute reads *are* reliable. So are
screenshots. `computer` clicks and scrolls land even when the call reports a
timeout — re-query the DOM afterwards rather than assuming it failed.

**The chessboard needs pointer events.** react-chessboard v5 uses dnd-kit, so
the harness's drag tool (mouse events) cannot move a piece. Drive it with a
`pointerdown` → several `pointermove` → `pointerup` sequence.

## Things that will bite

- **Never put per-move edits into `game` state.** The whole-game Stockfish
  review keys off that object's identity, so a keystroke there restarts about a
  minute of engine work. Comment edits live in a separate map in `App` and are
  folded into a derived `moves` array; do the same for anything similar.
- **Don't run `npx prettier`.** There is no config, so it applies its own
  defaults — semicolons and double quotes — and reformats an entire file against
  the house style (no semicolons, single quotes). It produced a 220-line diff
  for a 3-line change once.
- **Don't `git add -A` without reading `git status` first.** It once swept a
  personal file from the working tree into a pushed commit.
- The engine review takes roughly a minute for a 30-move game, and longer when
  the browser pane is backgrounded. Budget for it when testing anything
  downstream of `analysis`.

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
- `npm run build && npm test` before every commit. 95 tests as of this writing;
  they cover `src/lib` only — the UI is verified in the browser.

## State of play

Deployed at <https://chessnoter.vercel.app> from `main` (auto-deploy on push).
The version in the header is `major.minor` from `package.json` plus a build
number derived from the commit's timestamp, so it changes on every commit.

The Lichess sign-in and study import work: Chuck confirmed the whole flow
against his own account on 6 August 2026, after the pop-up handoff was changed
to identify the return by `state` rather than by a URL marker. Treat that path
as working, and suspect a regression rather than a never-worked bug if it
breaks.

**Never built:** a Send Feedback form. It was asked for once, then interrupted
before the one open question was answered — the app is fully static, so there is
no endpoint to receive mail. A `mailto:` handoff is the only option that cannot
be abused by bots, which was the stated requirement.
