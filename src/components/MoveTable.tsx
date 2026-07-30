import { useEffect, useRef } from 'react'
import type { Move } from '../lib/convert'
import { CLASSIFICATION_SYMBOL, hasMoveMarker } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import { classColor } from './ClassBadge'

interface MoveTableProps {
  moves: Move[]
  result: string | null
  /** Current ply: 0 = start, ply i = position after moves[i-1]. */
  ply: number
  onPlyChange: (ply: number) => void
  analysis: GameAnalysis | null
}

interface Row {
  number: number
  white: { san: string; ply: number } | null
  black: { san: string; ply: number } | null
}

export default function MoveTable({ moves, result, ply, onPlyChange, analysis }: MoveTableProps) {
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [ply])

  const rows: Row[] = []
  moves.forEach((move, index) => {
    let row = rows[rows.length - 1]
    if (!row || row.number !== move.number) {
      row = { number: move.number, white: null, black: null }
      rows.push(row)
    }
    const cell = { san: move.san, ply: index + 1 }
    if (move.color === 'w') row.white = cell
    else row.black = cell
  })

  const cellButton = (cell: { san: string; ply: number } | null) => {
    if (!cell) return <span className="px-2 text-ink-mute">…</span>
    const current = cell.ply === ply
    const moveAnalysis = analysis?.moves[cell.ply - 1]
    const color = moveAnalysis ? classColor(moveAnalysis.classification) : undefined
    return (
      <button
        type="button"
        ref={current ? currentRef : undefined}
        onClick={() => onPlyChange(cell.ply)}
        aria-current={current ? 'true' : undefined}
        className={`w-full rounded px-2 py-0.5 text-left font-score text-sm transition-colors ${
          current ? 'bg-felt text-buff' : 'hover:bg-buff-soft'
        }`}
        style={current ? undefined : { color }}
      >
        {cell.san}
        {moveAnalysis && hasMoveMarker(moveAnalysis.classification) && (
          <span
            className="ml-1 text-[10px] font-bold"
            style={current ? undefined : { color }}
            aria-hidden="true"
          >
            {CLASSIFICATION_SYMBOL[moveAnalysis.classification]}
          </span>
        )}
      </button>
    )
  }

  return (
    <section
      aria-label="Moves"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule bg-card shadow-sm"
    >
      <div className="shrink-0 border-b border-rule px-4 py-2">
        <h2 className="font-display text-sm font-semibold">Moves</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-mute">
              <th className="w-9 px-2 py-1 text-right font-medium">#</th>
              <th className="px-2 py-1 text-left font-medium">White</th>
              <th className="px-2 py-1 text-left font-medium">Black</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number} className="border-t border-rule/60">
                <td className="px-2 py-0.5 text-right font-score text-xs text-ink-mute">
                  {row.number}
                </td>
                <td className="py-0.5 pr-1">{cellButton(row.white)}</td>
                <td className="py-0.5 pr-1">{cellButton(row.black)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result && (
          <p className="border-t border-rule/60 px-2 py-2 text-center font-score text-sm font-semibold">
            {result}
          </p>
        )}
      </div>
    </section>
  )
}
