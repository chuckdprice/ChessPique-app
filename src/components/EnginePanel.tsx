import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Engine, ENGINE_NAME, formatScore } from '../lib/engine/uci'
import type { AnalyzeUpdate, EngineLine } from '../lib/engine/uci'
import { saveEngineSettings } from '../lib/settings'
import type { EngineSettings } from '../lib/settings'
import EngineSettingsPanel from './EngineSettings'
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
  /**
   * Latest top-line score (white POV) and the depth that produced it; null
   * when idle. The depth lets the caller tell a deeper answer from a shallower
   * one for the same position.
   */
  onTopScore?: (score: import('../lib/engine/uci').Score | null, depth: number) => void
  /** First UCI move of each line, best first — drives the board arrows. */
  onFirstMoves?: (ucis: string[]) => void
}

/** Format a PV as numbered SAN from the given position, e.g. "9... e4 10. Ne1 h5". */
function numberedLine(fen: string, sans: string[]): string {
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
  return out.join(' ')
}

export default function EnginePanel({
  fen,
  enabled,
  onEnabledChange,
  settings,
  onSettingsChange,
  reviewActive = false,
  reviewProgress = null,
  onTopScore,
  onFirstMoves,
}: EnginePanelProps) {
  const engineRef = useRef<Engine | null>(null)
  const [update, setUpdate] = useState<AnalyzeUpdate | null>(null)
  // Whether a search is still running, so the depth badge can say whether the
  // number under it is going to keep climbing.
  const [searching, setSearching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastFlush = useRef(0)
  const onTopScoreRef = useRef(onTopScore)
  onTopScoreRef.current = onTopScore
  const onFirstMovesRef = useRef(onFirstMoves)
  onFirstMovesRef.current = onFirstMoves

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
    const gameOver = new Chess(fen).isGameOver()
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
      engineRef.current?.stop()
    }
  }, [enabled, fen, settings])

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
    onFirstMovesRef.current?.((update?.lines ?? []).map((line) => line.pvUci[0] ?? ''))
  }, [enabled, update])

  // Tear the worker down when the panel unmounts.
  useEffect(
    () => () => {
      engineRef.current?.destroy()
      engineRef.current = null
    },
    [],
  )

  const topLine: EngineLine | undefined = update?.lines[0]

  return (
    <section
      aria-label="Engine analysis"
      className="relative rounded-xl border border-rule bg-card shadow-sm"
    >
      {/* Nothing in this strip is taller than the text now, so it is padded
          like a row of text rather than like a header. */}
      <div className="flex items-center gap-3 px-4 py-1.5">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle engine analysis"
          onClick={() => onEnabledChange(!enabled)}
          // The track is only 16px tall now, so the tap target is grown past it
          // by a pseudo-element rather than by padding, which would show.
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors before:absolute before:-inset-2 before:content-[''] ${
            enabled ? 'bg-felt' : 'bg-rule'
          }`}
        >
          <span
            className={`absolute top-0.5 size-3 rounded-full bg-card shadow transition-[left] ${
              enabled ? 'left-[14px]' : 'left-0.5'
            }`}
          />
        </button>

        {/* Same size as the scores in the lines below: this is the first of
            them, not a headline over them. */}
        <span className="font-score text-xs font-semibold tabular-nums">
          {enabled && topLine ? formatScore(topLine.score) : '—'}
        </span>

        {/* Search depth gets its own non-shrinking badge so it is never clipped.
            It turns green when the search has stopped, so a number that is not
            moving reads as finished rather than as a stalled engine. */}
        {enabled && (
          <span
            title={
              searching
                ? 'Search depth reached so far — still thinking'
                : 'Search depth reached; the engine has stopped'
            }
            className={`shrink-0 rounded px-1.5 py-0.5 font-score text-xs font-semibold tabular-nums ${
              !searching && update ? 'bg-class-best text-white' : 'bg-buff-soft'
            }`}
          >
            d{update?.depth ?? '—'}
          </span>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-xs text-ink-mute">{ENGINE_NAME}</span>
          {reviewActive && <ReviewRing progress={reviewProgress} />}
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          aria-label="Engine settings"
          title="Engine settings"
          className="rounded-md p-1 text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink"
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

      {settingsOpen && (
        <EngineSettingsPanel
          value={settings}
          onChange={(next) => {
            onSettingsChange(next)
            saveEngineSettings(next)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {enabled && (
        <ul className="border-t border-rule px-4 py-1">
          {(update?.lines ?? []).map((line) => (
            <li
              key={line.multipv}
              className="flex items-baseline gap-2 py-0.5 font-score text-xs"
              title={`depth ${line.depth}: ${numberedLine(fen, line.pvSan)}`}
            >
              <span className="w-10 shrink-0 font-semibold tabular-nums">
                {formatScore(line.score)}
              </span>
              <span className="truncate text-ink-mute">{numberedLine(fen, line.pvSan)}</span>
            </li>
          ))}
          {!update && (
            <li className="py-1 text-xs text-ink-mute">
              {new Chess(fen).isGameOver() ? 'Game over' : 'Thinking…'}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
