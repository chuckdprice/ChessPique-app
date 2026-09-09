# v3: a library of games, backed by Lichess studies

Where the app is going, why the shape is what it is, and what the first slice
builds. Written before any of it exists, so that the reasoning survives being
wrong about the details.

## The idea in one paragraph

A study is a folder, a chapter is a game, and the games are converted PGN with
nothing else in them. The app signs in to Lichess already; a library on top of
that costs no server, syncs between devices for free, backs itself up on
somebody else's infrastructure, and gives every game a public URL. There is no
account system to build, no storage to pay for, and no privacy story to write —
the games live in the user's own Lichess account and the app only borrows them.

## Decisions, settled

- **Converted PGN only.** No analysis is stored. See "Lichess destroys the
  review" below for why storing it is not on the table, and "the %emt trap" for
  why storing an *unconverted* game is actively dangerous.
- **Overwrite only a chapter this session opened**, otherwise save as a new
  chapter. Blind overwrite is the only write the API offers, so provenance is
  what stands between a save and somebody else's work.
- **Two share buttons.** "Share game" is a self-contained link carrying the
  whole PGN; "View on Lichess" is the chapter URL. The self-contained one is
  the default — see "Sharing" below.
- **Tags are free text in the chapter's root comment**, lowercase letters,
  digits and hyphens, no spaces: `#dcc-2026`, never `#dcc 2026`. Stored as
  typed, matched case-folded. Managing them — rename, merge, a picker — comes
  later, but the grammar does not, because every tag is written into a PGN
  sitting on Lichess and cannot be quietly respelled afterwards.
- **The local store is a cache, never a master copy.** Anything it holds can be
  rebuilt by signing in. That is what keeps the backup problem small.

## What Lichess actually gives us

Read off the OpenAPI spec, `conf/routes`, and the lila sources named below on
7 September 2026, not from memory. These are the findings most expensive to
re-derive, so they are written down rather than left to be rediscovered.

### The whole API surface is nine routes

```
POST   /api/study                       create a study        30/day/user
GET    /api/study/{id}.pgn              export a whole study
GET    /api/study/{id}/{ch}.pgn         export one chapter
DELETE /api/study/{id}/{ch}             delete a chapter
GET    /api/study/by/{user}             list studies (ndjson)
GET    /api/study/by/{user}/export.pgn  export everything
POST   /api/study/{id}/import-pgn       add a chapter         1000/day/user
POST   /api/study/{id}/{ch}/tags        merge PGN tags
POST   /api/study/{id}/{ch}/moves       replace the move tree
```

Four absences shape the whole design:

- **No chapter listing.** The only way to learn what a study holds is to
  download all of it. This is why the cache exists at all.
- **No study delete.** `POST /study/{id}/delete` is the *web* route: cookie
  auth, no CORS, unreachable from a browser holding a Bearer token. The app can
  empty a study but never remove it.
- **No rename, for a study or a chapter.** A chapter's name is fixed at import
  and there is no endpoint to change it.
- **The listing returns four fields** — `id`, `name`, `createdAt`, `updatedAt`.
  No visibility, no chapter count. The app cannot tell whether a study is
  public, or how near 64 chapters it is, without downloading it.

### Chapter ids arrive inside the PGN

Because there is no listing call, this is the only way to learn them: Lichess
stamps `[StudyName]`, `[ChapterName]` and `[ChapterURL]` onto every chapter on
export, and the chapter id is the last path segment of `ChapterURL`. Verified
against a live public study, unauthenticated. One GET therefore yields a whole
folder — ids, names and games together.

### Lichess destroys the review

Three separate mechanisms, all of which have to be true at once for storing
analysis to work, and none of which is:

- `lila/modules/tree/src/main/tree.scala` strips **every** bracketed command
  from a comment, not a known list:
  `private val metaReg = """\[%[^\]]++\]""".r`, applied by `removeMeta`. A
  custom `[%cpq ...]` is gone on arrival.
- `%eval` is never read on import. `StudyPgnImport.parseComments` captures
  shapes, `%clk` and `%emt`, and nothing else. Evals in an exported chapter
  come from `chapter.serverEval` — Lichess's own analysis — via
  `annotator.addEvals` in `PgnDump.scala`. Confirmed live: a study exported
  with `evals=true` came back with clocks, variations and prose, and not one
  `%eval`.
- Custom PGN tags are dropped. `StudyPgnTags.filterRelevant` keeps a fixed
  roster and discards the rest; the tags endpoint additionally caps a value at
  140 characters.

Hence: converted PGN only, and the review is recomputed when a game is opened.

### What survives a round trip

| Survives | Lost |
| --- | --- |
| Moves, variations, NAGs | `%eval`, every one |
| Prose comments, including the root's | Any custom `[%...]` command |
| `%clk` | Any custom PGN tag |
| `%csl` / `%cal` shapes | `%emt` — see below |
| The kept tag roster | ECO, Opening (regenerated on export) |

The kept roster is White/Black plus Elo, Title, Team, FideId; TimeControl,
Date, Result, Termination, Site, Event, Round, Board, Annotator, GameId;
country tags; WhiteClock/BlackClock; and Variant/FEN when the start position is
not standard. Of the app's own `STANDARD_TAGS`, the ones that will not survive
are Mode, EventDate, EventType, Section, Stage, PlyCount, Variation and
SubVariation.

Two things this buys us that are easy to miss: `TimeControl` passes through
verbatim — only `""`, `"?"` and `"unknown"` are filtered by value — so
`4200d10` comes back with its delay intact even though Lichess itself cannot
read it; and `PgnDump` adds a generated tag only where one is absent, so
`[Annotator "https://chesspique.vercel.app/"]` survives rather than being
overwritten with the study owner's URL.

### The %emt trap, which is the dangerous one

Lichess does parse `%emt`, and then does this
(`StudyPgnImport.guessNewClockState`):

```scala
Clock(prev.centis - emt + tc.so(_.increment), trust = false.some)
```

Increment only. `tc` comes from `Tags.timeControl`, which parses
`limit+increment`, so `4200d10` does not parse, `tc` is `None`, and the bonus
is zero. For a delay game Lichess computes `prev - emt` every move — precisely
the double-charge that ran Chuck's clock to 0:00:00 on move 37 of a game he
finished with 35 seconds, and which `applyTimeRule` was fixed to avoid. Worse,
`PgnDump.branchToMove` writes `%clk` and never writes `%emt` back, so the
source data is gone and only the wrong answer survives.

Convert first, always. **Measured afterwards, on 7 September 2026: this app
cannot violate that rule, and the guard slice 1 was going to add is
unnecessary.** Conversion happens at the door — `handleConvert` is the only way
a game enters — and `formatTreeMovetext` writes `%clk` and never `%emt`, so
what reaches Lichess is always converted. The two cases were checked in the
running app against the Flynn–Price file: a `%emt` game whose starting clock
cannot be worked out refuses to load at all rather than loading without clocks
(85 of 85 moves carry `clkSeconds` when it can), and a game with no timing
simply has none. The danger above is entirely real about Lichess and entirely
unreachable from here — which is worth knowing before somebody "restores" the
guard, and worth re-checking if a path is ever added that saves source text
rather than the tree.

### Sharing

`GET /api/study/{id}/{ch}.pgn` serves public, non-unlisted chapters to
unauthenticated callers, and everything else only with a token. So a link that
merely *points* at a chapter works for a friend only if the study is public,
and breaks whenever the chapter is edited away or deleted.

A self-contained link avoids all of that, and it is small enough to be the
default. Measured with `gzip -9` and base64url:

| Game | raw | gzip | base64url |
| --- | --- | --- | --- |
| `converted_game.pgn`, 29 moves | 1555 B | 657 B | 876 chars |
| Flynn–Price DCC, 43 moves | 2309 B | 905 B | 1208 chars |

Both sit under the ~2000 characters where chat clients start breaking links.
`CompressionStream('gzip')` is available in every current browser, so this
needs no library.

## Data model

```ts
/** Where the loaded game came from, and may be written back to. */
interface GameOrigin {
  studyId: string
  chapterId: string
  /** Mainline UCIs as loaded, for the conflict check when one is added. */
  loadedKey: string
}

/** One study, as cached. `updatedAt` is the validator. */
interface CachedStudy {
  id: string
  name: string
  updatedAt: number
  fetchedAt: number
  games: CachedGame[]
}

interface CachedGame {
  chapterId: string
  chapterName: string
  /** The chapter's PGN exactly as Lichess served it. */
  pgn: string
  /** Parsed out for the picker, so a list does not re-parse 64 games. */
  white: string | null
  black: string | null
  date: string | null
  result: string | null
}
```

The cache is keyed by study id and validated by comparing the `updatedAt` from
`/api/study/by/{user}` against the stored one — one cheap ndjson call says which
studies need refetching. Nothing in it is authoritative; deleting the whole
database costs a re-download and nothing else.

## Slice 1 — the cache, Open, and Save

Deliberately the whole spine and none of the ornament: no folders, no tags, no
recents, no sharing. When it is done a game can come out of a study, be edited,
and go back. Everything later is a view over what this slice establishes.

### New: `src/lib/lichess/library.ts`

The API layer, taking its `fetch` the way `ExplorerClient` does, so the tests
prove the URL shapes and the error mapping without a network.

- `listStudies(token, username)` — reuse `streamStudies` from `studies.ts`.
- `fetchStudy(token, studyId)` → the whole study's PGN.
- `fetchChapter(token, studyId, chapterId)` → one chapter's PGN.
- `createStudy(token, { name, visibility })` → `{ id }`.
- `replaceMoves(token, studyId, chapterId, movetext)` → `POST .../moves`.
- `updateTags(token, studyId, chapterId, pgn)` → `POST .../tags`.
- `deleteChapter(token, studyId, chapterId)` → `DELETE`.
- `importPgn` already exists in `studies.ts` and stays there.

Serialize requests through one queue. Lichess allows an authenticated user
three concurrent study downloads, but the app has no reason to need more, and
one queue is the discipline `ExplorerClient` already proved.

### New: `src/lib/pgn/split.ts`

`splitGames(text): string[]` — a study export is many games in one file and
nothing in the codebase splits them yet. A new game starts at a `[` tag line
that follows a blank line after movetext; the awkward cases are a comment
containing a bracket and a game with no movetext at all, and both belong in the
tests.

Alongside it, `chapterIdFromPgn(pgn)`, pulling the last path segment out of
`[ChapterURL ...]`, and `chapterNameFromPgn(pgn)`.

### New: `src/lib/library/cache.ts`

IndexedDB, one object store keyed by study id, holding `CachedStudy`. The
decision logic — which studies are stale, given a listing and what is stored —
is a pure function tested on its own; the IndexedDB wrapper around it is thin
enough to verify in the browser.

Call `navigator.storage.persist()` once on first use. Safari evicts
script-writable storage for sites not visited in about a week, and this is the
documented way to ask it not to.

### Not changed: `src/lib/moveTree.ts`

The root comment already round-trips — `flushInto` puts a chapter's initial
comments on the root, and `formatTreeMovetext` unshifts them back ahead of the
first move (`moveTree.ts:701`), gated on `comments: true`. Measured rather than
read, after a first pass through the code concluded the opposite and stopped one
line short of the answer. This matters beyond slice 1: it is the precondition
for putting tags there in slice 5, and it is already met. The only thing to
remember is the gate — a save that writes movetext with `comments: false` would
drop a game's tags along with its prose.

### Changed: `src/App.tsx`

- `origin: GameOrigin | null`, set when a chapter is opened from a study the
  signed-in user owns, cleared by New Game, by opening a file, and by opening a
  share link. Never set from somebody else's study — that save would 403.
- After "Save as new chapter", adopt the returned chapter as the origin. Without
  this, five saves make five chapters.
- Save is two calls and they are not atomic: `moves` first, because it carries
  the game, then `tags`. A failure of the second is reported rather than
  swallowed, since it leaves new moves beside stale tags.
- Tags are sent as a diff. The endpoint keeps what you do not send and deletes
  only what you send with an empty value, so a tag the user removed has to be
  sent explicitly as `""` or it survives on Lichess.

### New: `src/components/LibraryPage.tsx`

A study picker over the cached listing, a game list within a study, and Open.
Plain and unstyled beyond the house minimum — the point of this slice is the
spine, and the surface is cheap to redo once the shape is known.

### Tests

`src/lib` only, per the house rule; the UI is checked in the browser.

- `split.test.ts` — multi-game splitting, a real study export among the cases,
  `ChapterURL` parsing, and a chapter whose comment contains a bracket.
- `library.test.ts` — URL and body shape per endpoint, the bearer header, 401
  mapped to the reauthorize path, the queue serializing, and the tag diff
  including a deletion.
- `cache.test.ts` — the staleness decision against a listing.

### Done when

A game opens from a study, is edited, saves back to the same chapter, and comes
back equivalent on reload; a game opened from a file saves as a new chapter
into a chosen study and the origin follows it; and `npm run build && npm test`
is green with the 269 existing tests still passing.

## The UI redesign, between slices 1 and 2

Slice 1 hung the library off a nav item beside a two-step bar — PGN File, then
Game Analysis — that the app had outgrown. That bar is gone. The app opens on
four choices (New Analysis, Upload or Drop a .pgn File, Paste a PGN Game, Open
from Lichess Study), the left-nav carries the same four in the same order, and
once any of them lands the analysis fills the screen. The PGN header editor and
the two text panes moved into a four-tab pane beside the board — Move List, PGN
Header, Orig PGN, Converted PGN — sharing the `TabPane` the chart panes already
used, which is now its own component. `PgnFilePage` and `StepNav` are deleted.

Two consequences for the slices below. Sharing (slice 3) still arrives with the
hash router, because `page` is still React state and the app still has no URL
routing of any kind. And the library page is now reached as **Open Study**,
which is also one of the four things the app offers on opening — so the library
is a way *in*, not a page off to the side, which is what it should have been
from the start.

## Later slices

Each is useful alone and none of them changes the spine.

2. **Recents and the picker over the cache.** *Done.* Two lists of shortcuts
   over what slice 1 caches. The staleness is caught in two places because it
   arrives two ways: a study that has gone is noticed when the listing comes
   back without it, taking its games with it, and a chapter deleted inside a
   study that still exists can only be found on the click, where the entry
   drops itself and says so.
3. **Sharing.** *Done.* `#/g/<base64url(gzip(pgn))>`, read once at boot. The
   fragment rather than the query, because a fragment never reaches the server
   and needs no rewrite rule on a static host — and because the query is where
   Lichess returns an OAuth code. Measured end to end: a 43-move game is a
   1294-character link, and it reopens with its clocks and its evals in a
   browser with every trace of the session cleared. The evals are the part a
   Lichess study could not have carried. "View on Lichess" sits beside it for a
   game that came from a chapter. The fragment stays while its game is the game
   on the board, so the link reloads, and is cleared the moment anything else
   is loaded.
4. **Folders and study creation.** *Done.* `studyId → folder name`, held
   locally, because a study's metadata is a name and two dates and there is no
   field to write a folder into. A plain name rather than a path: nesting wants
   a tree to draw it and a way to move a branch, and neither earns its keep
   until a reader has more folders than fit on a line. The map drifts by
   construction — a study made or deleted on lichess.org tells this app nothing
   — so it is pruned against the listing, and "unfiled" is a real place rather
   than an error state. A folder is exactly the studies naming it, so emptying
   one deletes it, and the bar falls back to All rather than sitting on a name
   nothing matches. Creation goes through `POST /api/study` and then re-lists
   rather than adding the study locally: the listing is what every other part of
   the page trusts, and a study this app invented would be a second source of
   truth. Deletion links out to lichess.org, as it always will.
5. **Tags.** Free text in the root comment, the grammar fixed above, with an
   autocomplete drawn from the local index from the first day — that alone
   prevents most of the `#kaprov` drift for almost no code. Search and filter,
   but no rename or bulk edit until the model has survived some real use: a
   rename is one `POST /moves` per affected game.
6. **Backup.** One JSON export and import covering settings, the folder map,
   recents and the tag index — with the tag index included so a restore is
   instant rather than triggering a full reindex. Built by **allowlist**, so
   that `chesspique.lichess` — which holds a live OAuth bearer token — can
   never be written into a file the user might mail to themselves, and so a
   future key cannot leak in by being forgotten.

## Traps

- The study export is served with `Last-Modified` and no `Cache-Control`, so a
  browser will answer it from its own cache for days. Both export calls set
  `cache: 'no-store'`. A stubbed `fetch` cannot see this — the bug reached the
  user through a test suite that never touched HTTP.
- Any new localStorage key goes through `readStored`; a key added with a plain
  `getItem` loses its history at the next rename.
- Tags in a public study are public. `#weak-opponent` is visible to anyone who
  finds it, and the UI should say so once.
- A study holds 64 chapters. Lichess says so itself when one is full, and
  `importPgn` already passes its message straight through.
- A save-then-reload is not byte-identical: Lichess reorders tags, reformats
  the movetext and appends its own `StudyName`/`ChapterName`/`ChapterURL`.
  Treat the study as the source of truth after a save rather than trying to
  preserve the app's formatting.
- Renaming a game means delete plus re-import, which mints a new chapter id and
  breaks any Lichess link already shared for it. Self-contained share links are
  unaffected — one more reason they are the default.
- The session rule is the v1 of the conflict check. The property actually
  wanted is "the chapter still holds what I loaded", which one extra GET can
  test by comparing mainline UCIs; that survives a reload — which matters,
  since `BoardBoundary` exists because the board does throw and blank the app —
  and catches two tabs in one session, which a flag cannot. `loadedKey` is on
  `GameOrigin` so this can be added without changing anything else.

## Release

`npm version minor` — never by hand, and `--no-git-tag-version` to leave it for
review — takes 2.5 to 3.0 when the branch is ready to merge. Tag `v2.5-final`
on the last v2.5 release first, the way `v2.0-final` and `v1.6-final` bracket
the releases before it, so a rollback has somewhere to go.
