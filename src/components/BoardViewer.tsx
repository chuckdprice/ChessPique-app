import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import { formatClockTime } from '../lib/convert'
import type { Move } from '../lib/convert'
import { hasMoveMarker } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { ReplayedGame } from '../lib/gameModel'
import ClassBadge from './ClassBadge'

export interface PlayerPlate {
  name: string
  /** Overall game accuracy, ready to print — e.g. "(87.3%)". */
  accuracy: string | null
  /** Remaining clock, or null when the PGN has no clock times. */
  clock: number | null
}

interface BoardViewerProps {
  replay: ReplayedGame
  ply: number
  orientation: 'white' | 'black'
  analysis: GameAnalysis | null
  arrows: Arrow[]
}

/** Top-right-corner position of a square as percentages, given orientation. */
function squareCorner(square: string, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97 // a=0
  const rank = parseInt(square[1], 10) // 1..8
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 8 - rank : rank - 1
  return { left: (col + 1) * 12.5, top: row * 12.5 }
}

/** Name + accuracy on the left, remaining clock right-aligned to the board edge. */
export function PlayerPlateRow({
  plate,
  color,
  accuracyTooltip,
}: {
  plate: PlayerPlate
  color: 'w' | 'b'
  accuracyTooltip: string
}) {
  return (
    <div className="flex h-full items-center gap-2">
      <span className="truncate text-sm font-medium">
        {plate.name}
        <span className="sr-only">{color === 'w' ? ' (White)' : ' (Black)'}</span>
      </span>
      {plate.accuracy && (
        <span
          className="shrink-0 cursor-help font-score text-[11px] text-ink-mute"
          title={accuracyTooltip}
        >
          {plate.accuracy}
        </span>
      )}
      {plate.clock != null && (
        <span
          className="ml-auto shrink-0 rounded bg-buff-soft px-2 py-0.5 font-score text-sm font-semibold tabular-nums"
          aria-label={`${color === 'w' ? 'White' : 'Black'} clock`}
        >
          {formatClockTime(plate.clock)}
        </span>
      )}
    </div>
  )
}

export default function BoardViewer({
  replay,
  ply,
  orientation,
  analysis,
  arrows,
}: BoardViewerProps) {
  const highlight = replay.lastMoveSquares[ply]
  const moveAnalysis = ply > 0 ? (analysis?.moves[ply - 1] ?? null) : null
  const showBadge = moveAnalysis != null && hasMoveMarker(moveAnalysis.classification)
  const badgeSquare = showBadge && highlight ? highlight[1] : null
  const badgePos = badgeSquare ? squareCorner(badgeSquare, orientation) : null

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (highlight) {
    for (const square of highlight) {
      squareStyles[square] = { backgroundColor: 'rgba(237, 189, 71, 0.5)' }
    }
  }

  return (
    <div className="relative size-(--board-size) overflow-hidden rounded-lg shadow-md">
      <Chessboard
        options={{
          position: replay.fens[ply],
          boardOrientation: orientation,
          allowDragging: false,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          squareStyles,
          arrows,
          // Keep the library's geometry defaults; only take over opacity so the
          // per-arrow rgba alpha is the single source of fade.
          arrowOptions: { ...defaultArrowOptions, opacity: 1, activeOpacity: 1 },
          lightSquareStyle: { backgroundColor: '#efe8d6' },
          darkSquareStyle: { backgroundColor: '#4e7d63' },
          darkSquareNotationStyle: { color: '#efe8d6' },
          lightSquareNotationStyle: { color: '#4e7d63' },
          boardStyle: { width: '100%', height: '100%' },
        }}
      />
      {moveAnalysis && badgePos && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${badgePos.left}%`,
            top: `${badgePos.top}%`,
            transform: 'translate(-70%, -30%)',
          }}
        >
          <ClassBadge classification={moveAnalysis.classification} size={20} />
        </div>
      )}
    </div>
  )
}

interface BoardNavProps {
  moves: Move[]
  ply: number
  lastPly: number
  onPlyChange: (ply: number) => void
  onRotate: () => void
  orientation: 'white' | 'black'
}

/** "12. h3" / "13... Bg6" label for the move that lands on `ply`. */
export function plyLabel(moves: Move[], ply: number): string | null {
  if (ply <= 0 || ply > moves.length) return null
  const move = moves[ply - 1]
  return `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}`
}

export function BoardNav({
  moves,
  ply,
  lastPly,
  onPlyChange,
  onRotate,
  orientation,
}: BoardNavProps) {
  const button =
    'rounded-md border border-rule bg-card px-2.5 py-1.5 leading-none text-ink transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-30'
  const prevLabel = plyLabel(moves, ply - 1)
  const nextLabel = plyLabel(moves, ply + 1)
  const currentLabel = plyLabel(moves, ply)

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Move navigation">
      <button
        type="button"
        className={`${button} text-lg`}
        onClick={() => onPlyChange(0)}
        disabled={ply === 0}
        aria-label="Go to start"
      >
        «
      </button>
      {/* Fixed widths so the row never reflows as move names change length. */}
      <button
        type="button"
        className={`${button} flex w-28 items-center gap-1.5 font-score text-xs`}
        onClick={() => onPlyChange(Math.max(0, ply - 1))}
        disabled={ply === 0}
        aria-label={prevLabel ? `Previous move: ${prevLabel}` : 'Back to starting position'}
      >
        <span aria-hidden="true">‹</span>
        <span className="truncate">{prevLabel ?? 'Start'}</span>
      </button>
      <span className="w-24 shrink-0 truncate rounded-md bg-felt px-2 py-1.5 text-center font-score text-xs font-semibold text-buff">
        {currentLabel ?? 'Start'}
      </span>
      <button
        type="button"
        className={`${button} flex w-28 items-center justify-end gap-1.5 font-score text-xs`}
        onClick={() => onPlyChange(Math.min(lastPly, ply + 1))}
        disabled={ply === lastPly}
        aria-label={nextLabel ? `Next move: ${nextLabel}` : 'Next move'}
      >
        <span className="truncate">{nextLabel ?? '—'}</span>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className={`${button} text-lg`}
        onClick={() => onPlyChange(lastPly)}
        disabled={ply === lastPly}
        aria-label="Go to end"
      >
        »
      </button>
      <button
        type="button"
        className={button}
        onClick={onRotate}
        aria-label={`Rotate board — view from ${orientation === 'white' ? "Black's" : "White's"} side`}
        title="Rotate board"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      <span className="sr-only" aria-live="polite">
        {currentLabel ?? 'Starting position'}
      </span>
    </div>
  )
}
