import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Chess } from 'chess.js'
import { Engine, ENGINE_NAME, formatScore } from '../lib/engine/uci'
import type { AnalyzeUpdate, Score } from '../lib/engine/uci'
import { saveEngineSettings } from '../lib/settings'
import type { EngineSettings } from '../lib/settings'
import { MaiaSession } from '../lib/maia/session'
import type { MaiaStatus } from '../lib/maia/session'
import { predictMoves, nearestRating } from '../lib/maia/model'
import type { MaiaMove } from '../lib/maia/decode'
import { colourSearchMs, firstMoves, movesToSearch, verdictsForMoves } from '../lib/maia/verdicts'
import type { Classification } from '../lib/engine/analysis'
import EngineSettingsPanel from './EngineSettings'
import MaiaColumn from './MaiaColumn'
import MiniBoard from './MiniBoard'
import ReviewRing from './ReviewRing'

interface EnginePanelProps {
  fen: string
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  settings: EngineSettings
  onSettingsChange: (next: EngineSettings) => void
  /**
   * The whole-game review, which is not this panel's search: its ring rides
   * here because this row is already on screen and never changes height, so a
   * review starting and finishing cannot move the board.
   */
  reviewActive?: boolean
  reviewProgress?: { done: number; total: number } | null
  /** Piece set and orientation, so a previewed line looks like the real board. */
  pieceSet: string
  orientation: 'white' | 'black'
  /**
   * Latest top-line score (white POV) and the depth that produced it; null
   * when idle. The depth lets the caller tell a deeper answer from a shallower
   * one for the same position.
   */
  onTopScore?: (score: import('../lib/engine/uci').Score | null, depth: number) => void
  /**
   * Each line's first move and the score it is worth, best first — the board's
   * arrows and the numbers printed at their heads.
   */
  onFirstMoves?: (lines: EngineArrow[]) => void
  /**
   * The review's "played like" estimate for whoever is on move, which is what
   * Maia's rating follows until the reader picks one. Null before the review
   * has run, or for a position with no estimate behind it.
   */
  playedLike?: number | null
  /** Maia's single most likely human move, for the board's one arrow. */
  onMaiaMove?: (move: MaiaMove | null) => void
}

/** One candidate as the board draws it: a move, and what the engine makes of it. */
export interface EngineArrow {
  /** Empty for a line the engine has not given a move for yet. */
  uci: string
  score: Score | null
}

/**
 * A PV as one printable token per move, e.g. ["9... e4", "10. Ne1", "h5"].
 *
 * One token per move rather than one string per line, because each token is
 * hovered on its own to preview the position it leads to.
 */
function pvTokens(fen: string, sans: string[]): string[] {
  const parts = fen.split(' ')
  let moveNo = parseInt(parts[5] ?? '1', 10) || 1
  let white = parts[1] !== 'b'
  const out: string[] = []
  for (const [i, san] of sans.entries()) {
    if (white) out.push(`${moveNo}. ${san}`)
    else if (i === 0) out.push(`${moveNo}... ${san}`)
    else out.push(san)
    if (!white) moveNo += 1
    white = !white
  }
  return out
}

/** Format a PV as numbered SAN from the given position, e.g. "9... e4 10. Ne1 h5". */
function numberedLine(fen: string, sans: string[]): string {
  return pvTokens(fen, sans).join(' ')
}

/**
 * The position after playing `sans` up to and including `upTo`, with the move
 * that reached it — or null if the line does not play out, which a PV arriving
 * mid-search can fail to do when it is one move stale for the position it is
 * listed under.
 */
function positionAfter(
  fen: string,
  sans: string[],
  upTo: number,
): { fen: string; from: string; to: string } | null {
  try {
    const game = new Chess(fen)
    let last
    for (let i = 0; i <= upTo; i++) last = game.move(sans[i])
    return last ? { fen: game.fen(), from: last.from, to: last.to } : null
  } catch {
    return null
  }
}

/** Board edge and card padding of the hover preview, in pixels. */
const PREVIEW_BOARD = 200
const PREVIEW_PAD = 6
const PREVIEW_BOX = PREVIEW_BOARD + PREVIEW_PAD * 2

export default function EnginePanel({
  fen,
  enabled,
  onEnabledChange,
  settings,
  onSettingsChange,
  reviewActive = false,
  reviewProgress = null,
  pieceSet,
  orientation,
  onTopScore,
  onFirstMoves,
  playedLike = null,
  onMaiaMove,
}: EnginePanelProps) {
  const engineRef = useRef<Engine | null>(null)
  const gearRef = useRef<HTMLButtonElement>(null)
  // Every hover preview is drawn against this one move, so the board does not
  // move as you read along a line.
  const firstTokenRef = useRef<HTMLSpanElement>(null)
  const [update, setUpdate] = useState<AnalyzeUpdate | null>(null)
  // Whether a search is still running, so the depth badge can say whether the
  // number under it is going to keep climbing.
  const [searching, setSearching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The hovered move's position, already placed: a fixed-position card cannot
  // be laid out relative to the move, so where it goes is worked out once, on
  // entering the move, from the rect the mouse is over.
  const [preview, setPreview] = useState<{
    fen: string
    move: { from: string; to: string }
    left: number
    top: number
  } | null>(null)
  const lastFlush = useRef(0)
  const onTopScoreRef = useRef(onTopScore)
  onTopScoreRef.current = onTopScore
  const onFirstMovesRef = useRef(onFirstMoves)
  onFirstMovesRef.current = onFirstMoves
  const onMaiaMoveRef = useRef(onMaiaMove)
  onMaiaMoveRef.current = onMaiaMove

  const maiaRef = useRef<MaiaSession | null>(null)
  const [maiaMoves, setMaiaMoves] = useState<MaiaMove[] | null>(null)
  const [maiaStatus, setMaiaStatus] = useState<MaiaStatus>('idle')
  const [maiaProgress, setMaiaProgress] = useState(0)
  const [maiaError, setMaiaError] = useState<string | null>(null)
  const [verdicts, setVerdicts] = useState<Map<string, Classification>>(new Map())
  // Whether the constrained search that colours Maia's moves is still running.
  const [colouring, setColouring] = useState(false)
  // Maia is deterministic — same position, same rating, same answer — so
  // stepping back through a game costs nothing after the first visit. The
  // engine's scores are not cached with it: those move with the search
  // settings, and a stale one would be a wrong colour rather than a slow one.
  const maiaCache = useRef(new Map<string, MaiaMove[]>())

  const maiaAuto = settings.maiaRating == null
  // 1500 is where the estimate lands for a middling game, and it is only what
  // gets shown before a review has produced anything better.
  const maiaRating = settings.maiaRating ?? nearestRating(playedLike ?? 1500)
  // Checked once and read by both engines: neither has anything to say about
  // a position that is already decided.
  const gameOver = useMemo(() => new Chess(fen).isGameOver(), [fen])

  // Live analysis loop: restart on position, toggle, or settings change.
  useEffect(() => {
    if (!enabled) {
      engineRef.current?.stop()
      onTopScoreRef.current?.(null, 0)
      onFirstMovesRef.current?.([])
      setSearching(false)
      return
    }
    let cancelled = false
    if (gameOver) {
      setUpdate(null)
      setSearching(false)
      return
    }

    const run = async () => {
      if (!engineRef.current) engineRef.current = new Engine()
      const engine = engineRef.current
      await engine.init({ hashMb: settings.hashMb, multiPv: settings.multiPv })
      if (cancelled) return
      engine.stop()
      setUpdate(null)
      setSearching(true)
      const final = await engine.analyze({
        fen,
        movetimeMs: settings.searchTimeSec * 1000,
        multiPv: settings.multiPv,
        onUpdate: (u) => {
          if (cancelled) return
          // Throttle re-renders; info lines can arrive very frequently.
          const now = performance.now()
          if (now - lastFlush.current > 120 || u.depth < 8) {
            lastFlush.current = now
            setUpdate(u)
            // The top line's own depth, not the search's: it is the depth that
            // produced the score being handed over.
            onTopScoreRef.current?.(u.lines[0]?.score ?? null, u.lines[0]?.depth ?? 0)
          }
        },
      })
      if (cancelled) return
      // The last throttled update can be a frame behind what the search
      // finished on, so the settled figures come from its own result.
      setUpdate({ depth: final.depth, lines: final.lines })
      setSearching(false)
      onTopScoreRef.current?.(final.lines[0]?.score ?? null, final.lines[0]?.depth ?? 0)
    }
    void run()

    return () => {
      cancelled = true
      // Abandon rather than stop: leaving a position also has to throw away the
      // colouring search queued behind this one, which is for a position that
      // is no longer on the board.
      engineRef.current?.abandon()
    }
    // The three the search itself reads, not the settings object: it now also
    // carries how the board draws the answer, and a whole search was thrown
    // away and restarted every time one of those was flipped.
  }, [enabled, gameOver, fen, settings.searchTimeSec, settings.multiPv, settings.hashMb])

  /**
   * The board's arrows, taken from the very lines being listed.
   *
   * They used to be sent from inside the search instead, which let the two
   * disagree: the settled result is set here once the search ends and that call
   * never sent them, so the arrows stayed on whatever the last throttled update
   * held. With equal-scoring moves that reorder between depths, the arrows kept
   * their old ranking and could point at a move the list no longer showed.
   *
   * A line with no principal variation yet keeps its place as an empty string,
   * so an arrow's rank is always its line's rank.
   */
  useEffect(() => {
    if (!enabled) return
    onFirstMovesRef.current?.(
      (update?.lines ?? []).map((line) => ({ uci: line.pvUci[0] ?? '', score: line.score })),
    )
  }, [enabled, update])

  /**
   * Ask Maia what a human would play here.
   *
   * One forward pass, no search — it settles long before Stockfish does, which
   * is why the column fills in first and the colours arrive after.
   */
  useEffect(() => {
    // A finished game is not a position anyone is about to move in. Maia would
    // answer it happily — the model is asked for a distribution over the legal
    // moves and there are none — leaving an empty list that reads as still
    // thinking, spinning under a "Thinking…" that never resolves. The engine
    // beside it has always stopped here and said so.
    if (!enabled || !settings.maia || gameOver) {
      setMaiaMoves(null)
      setVerdicts(new Map())
      setColouring(false)
      onMaiaMoveRef.current?.(null)
      return
    }
    const key = `${fen}|${maiaRating}`
    const cached = maiaCache.current.get(key)
    if (cached) {
      setMaiaMoves(cached)
      setVerdicts(new Map())
      setColouring(false)
      return
    }

    let cancelled = false
    setMaiaMoves(null)
    setVerdicts(new Map())
    setColouring(false)
    // Built on first use, not on mount: constructing it starts the download,
    // and the panel is on for most of a session with Maia off.
    const session = (maiaRef.current ??= new MaiaSession({
      onStatus: setMaiaStatus,
      onProgress: (loaded, total) => setMaiaProgress(total > 0 ? loaded / total : 0),
    }))
    predictMoves(session, fen, maiaRating)
      .then(({ moves }) => {
        if (cancelled) return
        maiaCache.current.set(key, moves)
        setMaiaError(null)
        setMaiaMoves(moves)
      })
      .catch((error: Error) => {
        // Maia failing is not the app failing: the engine panel carries on
        // exactly as it does with Maia switched off.
        if (!cancelled) setMaiaError(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, settings.maia, gameOver, fen, maiaRating])

  useEffect(() => {
    onMaiaMoveRef.current?.(maiaMoves?.[0] ?? null)
  }, [maiaMoves])

  /**
   * Score the Maia moves the panel's own search did not cover.
   *
   * This is the one place the feature costs real engine time. It waits for the
   * main search to settle, then runs a second one restricted to the moves it
   * missed — plus the engine's best move, so the baseline comes out of the same
   * search as the moves being measured against it.
   */
  useEffect(() => {
    // gameOver has to be tested here as well as in the effect above. On the
    // render that arrives at a mate, `update` and `maiaMoves` still hold the
    // position you came from — the nulls only land on the next one — so
    // without this the colouring search starts anyway, and nothing afterwards
    // clears the ring it turned on.
    if (!enabled || !settings.maia || gameOver || searching || !update || !maiaMoves) return
    const wanted = maiaMoves.slice(0, settings.multiPv).map((move) => move.uci)
    const primary = firstMoves(update.lines)
    const whiteToMove = fen.split(' ')[1] !== 'b'
    // Colour whatever the panel already knows before spending a search on the rest.
    setVerdicts(verdictsForMoves(wanted, primary, [], whiteToMove))

    const need = movesToSearch(wanted, primary)
    const engine = engineRef.current
    if (need.length === 0 || !engine) {
      setColouring(false)
      return
    }

    let cancelled = false
    // This search takes as long as the panel's own, and until it lands most of
    // Maia's moves sit in plain ink looking as though that were their verdict.
    // The ring is the difference between "unremarkable" and "not worked out
    // yet" — there is no total to count towards, so it spins.
    setColouring(true)
    engine
      .analyze({
        fen,
        movetimeMs: colourSearchMs(settings.searchTimeSec),
        multiPv: need.length,
        searchMoves: need,
      })
      .then((result) => {
        if (cancelled) return
        setVerdicts(verdictsForMoves(wanted, primary, firstMoves(result.lines), whiteToMove))
        setColouring(false)
      })
      .catch(() => {
        /* the position moved on; the next search will colour it */
        if (!cancelled) setColouring(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, settings.maia, gameOver, settings.multiPv, settings.searchTimeSec, searching, update, maiaMoves, fen])

  /** Maia's moves as the panel prints them: SAN, probability, and a verdict. */
  const maiaRows = useMemo(() => {
    if (!maiaMoves) return []
    return maiaMoves.slice(0, settings.multiPv).map((move) => {
      let san = move.uci
      try {
        san = new Chess(fen).move({
          from: move.uci.slice(0, 2),
          to: move.uci.slice(2, 4),
          promotion: move.uci.length > 4 ? move.uci[4] : undefined,
        }).san
      } catch {
        /* keep the UCI: a move that will not play is still worth showing */
      }
      return { uci: move.uci, san, prob: move.prob, classification: verdicts.get(move.uci) }
    })
  }, [maiaMoves, verdicts, fen, settings.multiPv])

  // Tear the workers down when the panel unmounts.
  useEffect(
    () => () => {
      engineRef.current?.destroy()
      engineRef.current = null
      maiaRef.current?.destroy()
      maiaRef.current = null
    },
    [],
  )

  // A preview belongs to the position it was opened over, so a new position or
  // the engine going off has to take it with it — mouseleave never fires when
  // the move it was on is unmounted from under the pointer.
  useEffect(() => setPreview(null), [enabled, fen])


  /**
   * Open the preview: fixed across, and just under the line being read.
   *
   * Two separate lessons. Following the mouse *horizontally* meant the board
   * slid along as you read a variation, so its left edge is pinned to the first
   * move of the first line and never moves. But pinning the top there too put
   * the board over the lines below it — you could not see the line you were
   * reading — so the top follows the hovered row and clears it.
   */
  const showPreview = (el: HTMLElement, sans: string[], upTo: number) => {
    const at = positionAfter(fen, sans, upTo)
    const anchor = firstTokenRef.current
    if (!at || !anchor) return
    const row = (el.closest('li') ?? el).getBoundingClientRect()
    // A viewport of no width is not a narrow one: a browser pane that has
    // stopped painting reports zero, and clamping to that would pin every
    // preview to the left edge. With nothing to clamp against, the move's own
    // edge is the honest answer.
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const left = anchor.getBoundingClientRect().left
    // Below the row it belongs to, and above it only when there is no room
    // below — which still leaves that row readable.
    const below = row.bottom + 6
    const top = vh > 0 && below + PREVIEW_BOX + 8 > vh ? row.top - PREVIEW_BOX - 6 : below
    setPreview({
      fen: at.fen,
      move: { from: at.from, to: at.to },
      left: vw > 0 ? Math.max(8, Math.min(left, vw - PREVIEW_BOX - 8)) : left,
      top: vh > 0 ? Math.max(8, Math.min(top, vh - PREVIEW_BOX - 8)) : top,
    })
  }

  return (
    <section
      aria-label="Move evaluations"
      className="relative rounded-xl border border-rule bg-card shadow-sm"
    >
      {/* The disclosure is the switch: open is the engine running, closed is
          the engine stopped. One control rather than a twisty beside a toggle
          that could disagree with it — and with both engines off, a closed pane
          costs nothing but its own title. */}
      <div className="flex items-center gap-3 px-4 py-1.5">
        <button
          type="button"
          aria-expanded={enabled}
          onClick={() => onEnabledChange(!enabled)}
          // Never the thing that gives way: a title shortened to "Move Ev…" to
          // make room for a dash reads as a bug. The spacer after it takes the
          // slack instead.
          className="flex shrink-0 items-center gap-1.5 text-left"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`size-3.5 shrink-0 text-ink-mute transition-transform ${
              enabled ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span className="whitespace-nowrap text-xs font-semibold">Move Evals</span>
        </button>

        <div className="min-w-0 flex-1" />

        {/* The review is not this panel's search; its ring rides here because
            this row is on screen whether the pane is open or shut. */}
        {reviewActive && <ReviewRing progress={reviewProgress} />}
      </div>

      {settingsOpen && (
        <EngineSettingsPanel
          anchor={gearRef}
          value={settings}
          onChange={(next) => {
            onSettingsChange(next)
            saveEngineSettings(next)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {enabled && (
        // Side by side only when this panel is wide enough for both, which is
        // its own width and not the viewport's: the side column is narrow on a
        // mid-size window even though `sm:` is long since true, and the fixed
        // Maia column starved the engine's lines to nothing there.
        <div className="@container/evals flex flex-col gap-2 border-t border-rule px-4 py-1">
          <div className="flex flex-col gap-2 @[22rem]/evals:flex-row @[22rem]/evals:gap-3">
          {settings.maia && (
            <MaiaColumn
              rows={maiaRows}
              rowCount={settings.multiPv}
              busy={colouring}
              gameOver={gameOver}
              rating={maiaRating}
              auto={maiaAuto}
              onRatingChange={(rating) => {
                const next = { ...settings, maiaRating: rating }
                onSettingsChange(next)
                saveEngineSettings(next)
              }}
              status={maiaStatus}
              progress={maiaProgress}
              error={maiaError}
            />
          )}

          <div className="min-w-0 flex-1">
            {/* Level with Maia's heading, and the same height whether or not
                Maia is showing, so the two lists start on one line. */}
            <div className="flex h-6 items-center gap-2">
              <span className="shrink-0 whitespace-nowrap text-xs font-bold">
                {ENGINE_NAME}: Engine Moves
              </span>

              {/* Depth belongs to the title, not to the gear: it says how far
                  this list has been searched. It turns green when the search
                  has stopped, so a number that is not moving reads as finished
                  rather than as a stalled engine. */}
              <span
                title={
                  searching
                    ? 'Search depth reached so far — still thinking'
                    : 'Search depth reached; the engine has stopped'
                }
                className={`shrink-0 rounded px-1.5 py-0.5 font-score text-[0.6875rem] font-semibold tabular-nums ${
                  !searching && update ? 'bg-class-best text-white' : 'bg-buff-soft'
                }`}
              >
                d{update?.depth ?? '—'}
              </span>

              <div className="min-w-0 flex-1" />

              <button
                ref={gearRef}
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                aria-label="Engine settings"
                title="Engine settings"
                className="shrink-0 rounded-md p-0.5 text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
                </svg>
              </button>
            </div>

            {/* Always as many rows as the engine is set to show, filled or not.
                A new position empties the list until the first result lands, and
                letting the list shrink to a single "Thinking…" and spring back
                bounced this pane — and everything under it — on every move. */}
            <ul onPointerLeave={() => setPreview(null)}>
              {Array.from({ length: settings.multiPv }, (_, slot) => {
                const line = update?.lines[slot]
                if (!line) {
                  return (
                    <li
                      key={`pending-${slot}`}
                      className="flex items-baseline gap-2 py-0.5 font-score text-xs text-ink-mute"
                    >
                      {slot === 0 ? (gameOver ? 'Game over' : 'Thinking…') : ' '}
                    </li>
                  )
                }
                return (
                  <li
                    key={`line-${slot}`}
                    className="flex items-baseline gap-2 py-0.5 font-score text-xs"
                    title={`depth ${line.depth}: ${numberedLine(fen, line.pvSan)}`}
                  >
                    <span className="w-10 shrink-0 font-semibold tabular-nums">
                      {formatScore(line.score)}
                    </span>
                    <span className="truncate text-ink-mute">
                      {pvTokens(fen, line.pvSan).map((token, i) => (
                        // The separating space is outside the move so that the
                        // hover highlight is the width of the move and not a
                        // space wider.
                        <Fragment key={i}>
                          {i > 0 && ' '}
                          <span
                            // The first move of the first line is what pins the
                            // preview's left edge, so it is the one element the
                            // preview needs to find.
                            ref={slot === 0 && i === 0 ? firstTokenRef : undefined}
                            className="cursor-help rounded-sm hover:bg-buff-soft hover:text-ink"
                            // Pointer rather than mouse events, so that a tap
                            // does not open a board a phone has no way to close:
                            // a touch fires mouseenter too, and nothing fires
                            // the leave.
                            onPointerEnter={(e) => {
                              if (e.pointerType === 'mouse')
                                showPreview(e.currentTarget, line.pvSan, i)
                            }}
                          >
                            {token}
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          </div>
        </div>
      )}

      {/* Through the body, so no ancestor's overflow can clip it: the pane is
          overflow-hidden from sm up, and the line it hangs off is truncating.
          It never takes the pointer, so moving along a line never lands the
          mouse on the board that the last move opened. */}
      {preview &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-rule bg-card shadow-lg"
            style={{ left: preview.left, top: preview.top, padding: PREVIEW_PAD }}
          >
            <MiniBoard
              fen={preview.fen}
              move={preview.move}
              orientation={orientation}
              pieceSet={pieceSet}
              size={PREVIEW_BOARD}
            />
          </div>,
          document.body,
        )}
    </section>
  )
}
