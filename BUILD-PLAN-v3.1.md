# v3.1: threads for the engine

**Built, and finished on 23 September 2026 — with the review deliberately left
on one thread.** Slices 1 to 3 shipped: the site is cross-origin isolated, the
engine is `@lichess-org/stockfish-web`, and the panel has a threads slider.
Slice 4 closed with no code change, which was a decision rather than an
omission.

Threads do make the review more accurate — agreement with a deep reference goes
from 77.8% ± 0.3 at one thread to 83.1% ± 2.7 at eight, measured over three
repeats each, nine runs with complete separation, exact permutation
p = 0.0119. About five points. They also make it markedly less reproducible:
two runs of the same game disagree on ~34 of 195 classifications at eight
threads against ~19 at one. Chuck took the reproducible review.

**Read the retraction in the Slice 0 section before quoting anything from
it.** Three figures in the first draft of this plan — +8.7 points at
p = 0.0095, an 18% time penalty, and an `awl` that improved with threads — did
not survive repetition, and the reason they did not is the most useful thing
here.

Everything here was measured against the published packages and the live sites,
not recalled. Where something is unverified it says so.

## The idea in one paragraph

Stockfish runs on one core here because it is the single-threaded build, and it
is the single-threaded build because WebAssembly threads need
`SharedArrayBuffer`, which a browser only gives a cross-origin-isolated page.
Lichess sends the two headers that ask for isolation; we send neither. The
reason to change that is not the obvious one. Extra threads do **not** reach a
given depth sooner — measured repeatedly, they reach it slightly later. What
they do is reach it *better*, because Lazy SMP spends the extra nodes on move
ordering and on resolving fail-highs rather than on depth. For an app whose
output is a move classification rather than a depth counter, that is the part
worth having.

## What is actually true

Measured with `curl` against the live sites:

| | COOP | COEP |
| --- | --- | --- |
| `lichess.org/analysis` | `same-origin` | `require-corp` |
| `chesspique.vercel.app` | — | — |

Those two headers are the whole mechanism. WASM threads are pthreads over a
`shared` `WebAssembly.Memory`, which is a `SharedArrayBuffer`; SAB was withdrawn
from every site after Spectre and given back only behind isolation. Confirmed in
the builds themselves: `stockfish-19-lite-single.js` contains the string
`SharedArrayBuffer` zero times, `stockfish-19-lite.js` contains it and `pthread`.

### Why the package we have cannot do it

`stockfish@19.0.0` ships a multi-threaded build and it is unusable as published.
`stockfish-19-lite.js` spawns its pool with

```js
new Worker(V("stockfish.worker.js"))     // V = locateFile → scriptDirectory + name
```

and that file is not in the tarball. Verified by listing the published artifact
rather than `node_modules`: nine files in `bin/`, none of them a worker
bootstrap. Emscripten emits `*.worker.js` at build time and nmrugg's package
does not include it.

### What Lichess uses instead

`@lichess-org/stockfish-web@0.5.0`. `lila-stockfish-web` is the retired name —
last published April 2025 at Stockfish 17.1, and the repo has moved to
`lichess-org/stockfish-web`.

The current package holds exactly what is in the screenshot that started this:

```
sf_19_smallnet.wasm                              516 KB
nn-61e7af4bb97d.nnue   (fetched separately)     1.11 MB   ← the "1MB" on the label
sf_19.wasm                                       587 KB
nn-1a298aa575a0.nnue   (fetched separately)    75.29 MB
```

plus `relaxed-simd` variants of both and Fairy-Stockfish 14. Every build carries
`SharedArrayBuffer` and `pthread`, and spawns its pool with

```js
new Worker(new URL("sf_19_smallnet.js", import.meta.url), { type: "module" })
```

A self-spawning module worker, no separate bootstrap, so the blocker above does
not apply. That is the reason to take Lichess's distribution rather than source
a `stockfish.worker.js` for nmrugg's.

Note the net is **1.11 MB**, not the 0.93 MB a `curl -I` through the redirect
chain reports. Its filename is its own SHA-256 prefix, which is a free integrity
check on download.

### What isolation costs us

Each checked rather than reasoned about, because the browser-pane section of
`CLAUDE.md` exists entirely because of things that were reasoned about.

| | verdict |
| --- | --- |
| Google Fonts (`index.html:16-18`) | safe — both hosts answer with `cross-origin-resource-policy: cross-origin` |
| Lichess study + explorer API | safe — a CORS fetch satisfies COEP by passing the CORS check |
| The Lichess OAuth pop-up | safe, and by luck |
| iframes, embeds, service worker | none in the app |
| Maia / onnxruntime | improves — it pins `numThreads: 1` only because SAB is missing |

The pop-up should have been fatal. `COOP: same-origin` severs `window.opener`
the moment a pop-up navigates cross-origin, so the usual `opener.postMessage`
handoff would break. Ours does not use one: `oauth.ts:44` hands the result back
over a `BroadcastChannel` with a localStorage fallback, *because the opener link
was already seen being severed in the field*. A fix made for a different reason
makes us COOP-ready.

Isolation itself was then confirmed live: `crossOriginIsolated === true`,
`SharedArrayBuffer` present, 14 cores visible, nothing in the app broken,
`npm run build && npm test` clean at 430 tests.

## Slice 4 — the repeats, and what they took back

Run on 23 September 2026, before any calibration, because `REVIEW_THREADS`
needed a number and slice 0 had only measured two of them.

198 positions, 195 moves, depth 20 with the 2500ms cap, scored against the same
saved depth-26 single-threaded reference as everything below — three repeats of
each configuration this time, which is the step slice 0 skipped:

| threads | agreement with reference | mean abs awl err | capped positions |
| --- | --- | --- | --- |
| 1 | **77.8% ± 0.3** (77.9, 77.9, 77.4) | 0.260 ± 0.093 | 4, 4, 6 |
| 8 | **83.1% ± 2.7** (80.0, 85.1, 84.1) | 0.260 ± 0.099 | 14, 12, 12 |
| 10 | **82.2% ± 1.6** (83.6, 82.6, 80.5) | 0.267 ± 0.223 | 19, 21, 17 |

Complete separation across nine runs — the worst threaded run beats the best
single-threaded one — so the effect is real at **+4.9 points**, exact
permutation p = 0.0119. Not the +8.7 claimed below, which compared a lucky
threaded run against an unlucky single-threaded one.

### What the repeats took back

**A search with a movetime cap is not deterministic.** Even at one thread,
where the cap bites; and Lazy SMP makes every position non-deterministic. So
every single-run table is one draw from a distribution, and slice 0's headline
compared two draws as though only the configuration differed.

Concretely, the noise floor: two runs of the *same* configuration disagree on
19 moves out of 195 at one thread and 34 at eight. Between *different*
configurations it is 28 to 39. So counting differing classifications — which is
what McNemar did — cannot separate these configurations at all. Agreement with
a reference can, because it is directional rather than symmetric. Right
conclusion, wrong instrument, and only repetition distinguishes those.

**`awl` does not improve, and that is the finding that mattered most.** 0.260,
0.260, 0.267 across one, eight and ten threads. It is the input to the
played-like rating, so threads move classifications and leave the rating alone
— which is why the calibration pipeline was never run, and why raising
`REVIEW_THREADS` later would probably not need one either. Probably: verify it.

**The 18% time penalty is zero.** 168.1s against 169.4s.

### Why one thread won anyway

Threads triple the number of positions that hit the 2500ms cap — 4 to 6 at one
thread, 12 to 21 above it — and a capped search is the time-dependent one. That
is the whole mechanism behind the extra variance, and it is why ten threads is
no better than eight.

Reviewing the same game twice and getting a different answer on 17% of its
moves is a worse product than being five points closer to a reference nobody
sees. If this is revisited, the thing to try first is **raising the cap along
with the threads**: it attacks the variance at its source, and it was never
measured.

## Slice 0 — what it measured, and what it got wrong twice

**Superseded in part by Slice 4 above.** The tables here are single runs. The
+8.7 point gap and the 18% time penalty are both artifacts of that; the
direction of the thread effect survives, its size does not.

M4 Pro, 10 performance cores and 4 efficiency. Engine `sf_19_smallnet` +
`nn-61e7af4bb97d.nnue` on **both** sides of every comparison, so the thread
effect is isolated from the engine swap. Three real games from the repo — the
sample Sicilian and both DCC tournament games — 198 positions, 195 moves.

### The result

Scored against a depth-26 **single-threaded** reference, which is deterministic
and shares no search character with the threaded configurations:

| config | time | classifications match ref | best move | mean abs awl err | mean abs rating err |
| --- | --- | --- | --- | --- | --- |
| `d20 t=1` (today) | 147.8s | 147/195 = **75.4%** | 83.7% | 0.56 | 33 |
| `d20 t=10` | 174.6s | 164/195 = **84.1%** | 81.1% | 0.456 | 33 |
| `d22 t=1` | 325.8s | 152/195 = **77.9%** | 85.2% | 0.344 | 17 |
| `d22 t=10` | 351.8s | 155/195 = **79.5%** | 81.6% | 0.467 | 33 |

McNemar on the paired per-move agreement:

| comparison | discordant | p |
| --- | --- | --- |
| `d20 t=1` vs `d20 t=10` | 11 / 28 favouring threads | **0.0095** |
| `d20 t=1` vs `d22 t=1` | 12 / 17 favouring depth | 0.46 |
| `d22 t=1` vs `d20 t=10` | 13 / 25 favouring threads | 0.073 |
| `d20 t=10` vs `d22 t=10` | 18 / 9 | 0.12 |

Read together: **threads buy about nine points of classification accuracy at
the same depth, and extra depth on one thread does not.** Ten threads at depth
20 also beats one thread at depth 22 on accuracy while taking half the time.

The effect is not an artifact of the reference. Against a depth-26 *threaded*
reference the gap was +6.2 points; against the single-threaded one it is +8.7.
Reference affinity would push the other way, so it cannot be the explanation.

### The price

Threads are **slower**, and this replicated across two independent runs:
174.6s against 147.8s for a depth-20 review of three games, an 18% penalty.
Even the depth-26 reference was slower threaded (1312.6s) than single-threaded
(1250.9s). Time to depth never improved at any search length tested — 9.76x the
node rate bought 1.16x the speed to a given depth, which is Lazy SMP working as
designed.

So the trade is roughly **49s → 58s per game reviewed, for ~9 points of
classification accuracy**, and there is no setting of the depth that buys the
same thing without threads.

### The two wrong turns, recorded so they are not taken again

**Time to depth is the wrong metric for Lazy SMP, and the first pass made it
the headline.** Extra threads do not reach depth N sooner; they reach a better
depth N. Leading with 9.76x against 1.16x looked damning and measured the one
thing that cannot capture the benefit. The first verdict — don't build it —
came out of that and was wrong.

**A threaded reference flatters threaded configurations, and the second pass
fell for it.** Against a depth-26 ten-thread reference, `d22 t=10` scored 81%
with an awl error of 0.194 and a rating error of 0, which looked decisive. Under
a fair reference the same row is 79.5% / 0.467 / 33. Best-move agreement is the
clearest tell: threads score +1.1 against a threaded reference and −2.6 against
a single-threaded one, a 3.7-point swing that tracks the reference's own
character rather than correctness. **Discard the best-move column entirely.**

Two more measurement traps, both of which produced wrong numbers first:

- **Warm-up.** Whichever configuration runs first is measurably slowest while
  wasm tiers up. An early run reported threads making the review 14% *faster*;
  with a discarded warm-up sweep first, the same comparison shows them 18%
  slower. Every timed run needs a throwaway pass ahead of it.
- **Contention.** An earlier agreement run had the browser pane searching at the
  same time and came out backwards. A contended engine benchmark is not a noisy
  measurement, it is a wrong one.

And one column to distrust in the table above: **awl and rating error are six
numbers** — three games, two sides. `d22 t=1` looking best there is an anecdote
sitting next to a 195-sample column. Only the classification column has power.

### The bundler, settled

Three separate failures, all real:

1. Vite's dep optimizer rewrites the module into `node_modules/.vite/deps/`, so
   its `locateFile` fetches the SPA's `index.html` instead of the `.wasm` and
   dies on the magic word (`3c 21 64 6f` is `<!do`).
2. A literal `import()` of a path under `/public` is refused by
   `vite:import-analysis`, which runs *before* `@vite-ignore` is honoured.
3. `vite build` fails outright: *"Module format iife does not support top-level
   await."* Rollup cannot bundle this engine at all.

All three go away by putting a hand-written worker in `public/stockfish/` that
imports the engine beside it — which is how `stockfish-19-lite-single.js` is
already loaded. It also closed a 5x performance hole: the dep-optimised module
ran at 225k nps, the worker-hosted one at 1.16M, matching Node exactly.

## Decisions wanted before Slice 2

Slice 1 needs none of these.

1. **The licence, and it is the real one.** `@lichess-org/stockfish-web`
   declares `AGPL-3.0-or-later` in its `package.json`, ships a plain
   **GPL-3.0** `LICENSE` file, and GitHub reports the repo as GPL-3.0. Those
   three disagree. Copyleft itself is not new — we already ship
   `stockfish@19.0.0` under GPL-3.0, and the Maia weights are already
   AGPL-3.0 — but AGPL §13 is the clause that bites a web app: anyone
   interacting with it over a network is owed an offer of source. ChessPique
   has **no `LICENSE` file**, and `package.json` carries `private: true` with
   no licence field. This plan does not adjudicate which licence governs; it
   records that the question is already live because of Maia, that this makes
   it harder to keep ignoring, and that it is Chuck's to answer or to put to
   upstream.
2. **Which net.** Recommend `sf_19_smallnet` + `nn-61e7af4bb97d.nnue` — which is
   the net the shipped `lite-single` build already embeds, so this is the same
   engine and the same weights in a different wrapper. 1.60 MB together against
   1.70 MB today, and the only real change is that 1.11 MB of it arrives as a
   separate cached download instead of inside the wasm. The big net is 75.3 MB,
   which is Maia's 46 MB again and worse.
3. **Whether a slower review is acceptable at all.** This is the feature's whole
   shape. If a minute-long review becoming seventy seconds is not worth nine
   points of classification accuracy, stop here — nothing later in this plan
   changes that trade.

## Slice 1 — isolation, with nothing depending on it

Deliberately useless on its own. It is the part with blast radius, and the part
that is one file to revert.

### New: `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

`vercel.json` rather than the newer `vercel.ts`: this is a static Vite build
with no other platform configuration, and a four-line JSON file needs neither a
dependency nor a build step.

### Changed: `vite.config.ts`

The same two headers under `server.headers` **and** `preview.headers`, so dev
and `vite preview` match production. Without this, isolation exists only in
production and every local check is made against a page that cannot do the thing
being checked.

### Verification, and this is most of the slice

Ship it to a **preview deployment first**, not to `main`. Then, against that
preview:

- `crossOriginIsolated === true` and `typeof SharedArrayBuffer === 'function'`;
- fonts render — a blocked stylesheet under COEP is silent, the page just gets
  the fallback face;
- the full Lichess sign-in pop-up round trip, on Chuck's own account, since no
  session here can get a token;
- the opening explorer returns rows;
- Maia downloads and runs;
- no `ERR_BLOCKED_BY_RESPONSE` of any kind in the console.

If something *is* blocked, `COEP: credentialless` is the gentler setting — it
enables isolation without demanding CORP on cross-origin subresources. Its
browser support is worth checking before reaching for it; it should not be
needed, since the only cross-origin subresource we have already carries CORP.

### Done when

The preview is isolated, all six checks pass, and `npm run build && npm test` is
clean. Nothing in the app behaves differently.

## Slice 2 — the engine, in a worker we own

`src/lib/engine/uci.ts` already hides the worker behind `class Engine`
(`init` / `setOptions` / `analyze` / `stop` / `abandon` / `destroy`), and
`EnginePanel` is its only consumer. This is a second backend, not a rewrite.

### New: `public/stockfish/sf-worker.js`

Hand-written, never seen by the bundler, speaking the same postMessage UCI
protocol as the shipped worker. It dynamic-imports `./sf_19_smallnet.js` beside
itself, sets `locateFile` to resolve the `.wasm` against `import.meta.url`,
fetches the net and calls `setNnueBuffer`, then queues commands until ready.
The three bundler failures above are why it is written by hand rather than
imported; do not "modernise" it.

`scripts/copy-stockfish.mjs` copies the two engine files in alongside the
existing pair. The net is a separate asset — see below.

### Changed: `src/lib/engine/uci.ts`

Two backends behind the existing surface:

- `crossOriginIsolated === true` → the new worker.
- otherwise → today's `stockfish-19-lite-single.js`, unchanged.

The fallback is not politeness. It is what keeps the app working if the headers
have to come off in a hurry, and what keeps `npm test` honest in Node.

`ENGINE_NAME` reads `SF19` for both and stays true, and — corrected on
22 September 2026, after an earlier draft of this plan claimed otherwise — the two
backends play **the same** chess at one thread. `strings` on the shipped
`stockfish-19-lite-single.wasm` finds `nn-61e7af4bb97d.nnue`, the very net
`sf_19_smallnet` fetches separately. Same Stockfish 19, same net; the difference
is packaging (1.70 MB with the net baked in, against 0.49 MB plus a 1.11 MB
download) and the ability to spawn threads. So the swap is not the eval change
the earlier draft budgeted for — which makes the one-thread comparison below a
cheap check rather than an expected difference, and moves the whole
re-calibration case onto threading.

### New: the net, fetched and cached

`public/maia3/maia-worker.js` already does this job for a 46 MB model —
IndexedDB by name and version, `{ type: 'progress', loaded, total }` back to the
caller. Follow it rather than inventing a second mechanism, keyed by the net's
filename so a future net is a cache miss and not a stale hit. Verify the
download against its own filename, which is its SHA-256 prefix.

Hosting the net is the same GPL-3.0 redistribution we already do for the engine.

### Types

The package declares types for the bare specifier only and has no `exports`
map, so every subpath import needs a local `declare module` shim. Without it
`tsc -b` fails with TS7016.

### Threads stay at 1 in this slice

Nothing here sends `setoption name Threads`. The point is to land the engine
swap with exactly one variable changed, so the comparison below means something.

### Done when

The panel produces lines from the new engine under isolation and from the old
one without it; the net is cached across a reload; and there is a written
comparison of classifications on the three spike games, old engine against new
at one thread. That comparison is an input to Slice 4.

## Slice 3 — threads in the UI, and in the calibration

### Changed: `src/components/EngineSettings.tsx` and `SettingsPage.tsx`

The `Threads` row at `EngineSettings.tsx:141` is currently `min={1} max={1}`,
`disabled`, captioned "Single-threaded in browser WASM". It becomes a live
slider from 1 to `navigator.hardwareConcurrency`, keeping the disabled form and
that caption when `crossOriginIsolated` is false — the caption is then true
rather than a limitation of the app, and saying so beats hiding the row.

Both menus get it, because `SettingsPage` mirrors `EngineSettings`. The stored
value goes through `readStored`, like every other key.

Default: **not** `hardwareConcurrency`. Pinning every core makes the browser
unresponsive during a review that now runs longer than it used to. The spike
used 10 of 14 and that is the shape to copy — something like
`max(1, hardwareConcurrency - 4)`.

The UI has to be honest about the trade, because it is the opposite of what a
thread count usually implies: more threads make the review **slower** and more
accurate. A caption saying so belongs next to the slider.

### Changed: `scripts/lib/node-engine.mjs`

The calibration scripts run **nmrugg's** build through Node. Upstream says
plainly that `@lichess-org/stockfish-web` is "not straight-forward to load and
use" and bootstraps Node through its own `tools/wasm-cli.ts` — though the spike
drove it from Node directly without much trouble, in about a hundred lines.

Leaving this alone means calibrating with one engine and shipping another, which
is the drift `ENGINE_BUILD` was added to make impossible after a hardcoded
`stockfish-18` stamp survived the upgrade to 19. Port it, and let `ENGINE_BUILD`
keep deriving its stamp from what is installed.

### Done when

A thread count set in either menu reaches the engine, `info` lines show the node
rate rising with it, the setting survives a reload, and the Node harness runs
the same build the browser does.

## Slice 4 — re-calibration, which turned out not to be needed

**Not run, and that is the outcome rather than a gap.** An earlier draft of this
section called a re-fit mandatory on the grounds that the net had changed and
the search had changed qualitatively. Both premises fell:

- The net never changed. `lite-single` already embeds `nn-61e7af4bb97d`, the
  same net the threaded build fetches.
- The search did not change either, because `REVIEW_THREADS` stayed at 1.

And the measurement that would have justified it says the input is untouched in
any case: `awl` sits at 0.260 across one, eight and ten threads, so the quantity
`PLAYED_LIKE_A/B` map to a rating is the same quantity it was fitted against.

The pipeline is nonetheless in better shape than it was, and the changes are
worth keeping. `calibrate-rating.mjs` used to copy `REVIEW_DEPTH` and
`REVIEW_MOVETIME_CAP_MS` behind a "keep in sync" comment — the arrangement that
let a hardcoded `stockfish-18` stamp survive the upgrade to 19 — and now scrapes
all three constants out of `analysis.ts`, throwing if a name goes missing. It
records the thread count in each shard, and `scripts/lib/node-engine.mjs` drives
the same `@lichess-org/stockfish-web` build the browser does.

**The sharding rule changed with it**: shards × threads must not exceed the
machine's cores. Oversubscribing does not merely run slow, it changes the
search, and a shard searched differently from the app is a sample that does not
describe the app. At `REVIEW_THREADS = 1` this is the old advice. Above 1,
divide.

If the curve is ever re-fitted, the two traps from the Stockfish 19 run still
apply: a new report's MAE is not comparable to an old report's on a different
sample, and `fetch-calibration-games.mjs` samples whichever rapid arenas are
live, so a run can silently have no 2200+ band and say nothing about the top of
the curve.

## Traps

- **Isolation is a property of the document, and there is no per-user flag for
  it.** Slices 2-4 can hide behind a setting; Slice 1 cannot. That is why it
  ships to a preview URL first and why it is its own revert.
- **A COEP-blocked subresource fails quietly.** A blocked font is a fallback
  face, not an error dialog. Grep the console for `ERR_BLOCKED_BY_RESPONSE`
  deliberately.
- **Threads make the review slower.** Anyone arriving at this feature expecting
  a speed-up will "fix" it by reducing the thread count and undo the accuracy
  with it. The caption on the slider and the comment in `uci.ts` both have to
  say what the threads are for.
- **A user-settable thread count is a user-settable accuracy.** Nothing else in
  the review is adjustable for exactly this reason, and the played-like figure
  is calibrated against one setting. Either pin the review's thread count
  separately from the panel's, or accept that the rating estimate drifts with a
  slider — the first is probably right and this plan does not decide it.
- **The engine swap should be near-neutral at one thread, and that is a
  prediction to test rather than assume.** Both builds are Stockfish 19 on
  `nn-61e7af4bb97d`, so a large classification difference at one thread means
  something else is going on — a build flag, a wrong net, a bug in the worker —
  and is worth chasing before threads are switched on.
- **Never benchmark this on a busy machine, and never time the first run.**
  Both produced wrong answers during Slice 0, in opposite directions.
- **Never score a threaded search against a threaded reference.** It flatters
  its own kind by several points. The reference is single-threaded and
  depth-limited, which also makes it reproducible.
- **`new URL(..., import.meta.url)` inside a dependency** works in dev and
  breaks in a production bundle. The hand-written worker exists to keep that
  question from ever being asked.
- **The browser pane is not where to take a number.** Its single-threaded
  measurements came in 3x low while its ten-thread ones matched Node. Use it to
  confirm a mechanism works; use Node for the figures, and a real browser for
  anything user-facing.

## Release

`npm version minor` — never by hand, `--no-git-tag-version` to leave it for
review — takes 3.0 to 3.1. Tag `v3.0-final` on the last 3.0 release first, the
way `v2.5-final`, `v2.0-final` and `v1.6-final` bracket the ones before it, so a
rollback has somewhere to go.

A rollback here is unusually likely to be wanted in a hurry, because Slice 1
affects every page load rather than one feature. Removing `vercel.json` and
redeploying is the fast path, and the fallback backend in Slice 2 is what makes
it safe.
