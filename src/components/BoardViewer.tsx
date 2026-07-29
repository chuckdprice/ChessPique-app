import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { formatClockTime } from '../lib/convert'
import type { Move } from '../lib/convert'
import type { ReplayedGame } from '../lib/gameModel'

interface BoardViewerProps {
  replay: ReplayedGame
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  whiteName: string
  blackName: string
}

function PlayerRow({ name, color }: { name: string; color: 'w' | 'b' }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span aria-hidden="true" className="text-lg leading-none text-ink">
        {color === 'w' ? '♔' : '♚'}
      </span>
      <span className="text-sm font-medium">
        {name}
        <span className="sr-only">{color === 'w' ? ' (White)' : ' (Black)'}</span>
      </span>
    </div>
  )
}

export default function BoardViewer({
  replay,
  moves,
  ply,
  onPlyChange,
  whiteName,
  blackName,
}: BoardViewerProps) {
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const lastPly = replay.fens.length - 1
  const move = ply > 0 ? moves[ply - 1] : null
  const highlight = replay.lastMoveSquares[ply]

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (highlight) {
    for (const square of highlight) {
      squareStyles[square] = { backgroundColor: 'rgba(237, 189, 71, 0.5)' }
    }
  }

  const topName = orientation === 'white' ? blackName : whiteName
  const bottomName = orientation === 'white' ? whiteName : blackName

  const navButton =
    'rounded-md border border-rule bg-card px-3 py-1.5 text-lg leading-none text-ink transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <section aria-label="Chessboard" className="flex flex-col items-center gap-2">
      <div className="w-full max-w-[560px]">
        <PlayerRow name={topName} color={orientation === 'white' ? 'b' : 'w'} />
        <div className="overflow-hidden rounded-lg shadow-md">
          <Chessboard
            options={{
              position: replay.fens[ply],
              boardOrientation: orientation,
              allowDragging: false,
              allowDrawingArrows: false,
              animationDurationInMs: 150,
              squareStyles,
              lightSquareStyle: { backgroundColor: '#efe8d6' },
              darkSquareStyle: { backgroundColor: '#4e7d63' },
              darkSquareNotationStyle: { color: '#efe8d6' },
              lightSquareNotationStyle: { color: '#4e7d63' },
              boardStyle: { width: '100%' },
            }}
          />
        </div>
        <PlayerRow name={bottomName} color={orientation === 'white' ? 'w' : 'b'} />
      </div>

      <div className="flex items-center gap-2" role="group" aria-label="Move navigation">
        <button
          type="button"
          className={navButton}
          onClick={() => onPlyChange(0)}
          disabled={ply === 0}
          aria-label="Go to start"
        >
          «
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => onPlyChange(Math.max(0, ply - 1))}
          disabled={ply === 0}
          aria-label="Previous move"
        >
          ‹
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => onPlyChange(Math.min(lastPly, ply + 1))}
          disabled={ply === lastPly}
          aria-label="Next move"
        >
          ›
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => onPlyChange(lastPly)}
          disabled={ply === lastPly}
          aria-label="Go to end"
        >
          »
        </button>
        <button
          type="button"
          className={navButton}
          onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
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
      </div>

      <p className="h-5 font-score text-sm text-ink-mute" aria-live="polite">
        {move
          ? `${move.number}${move.color === 'w' ? '.' : '...'} ${move.san} — clock ${formatClockTime(move.clkSeconds ?? 0)}`
          : 'Starting position — use the arrows or ← → keys'}
      </p>
    </section>
  )
}
