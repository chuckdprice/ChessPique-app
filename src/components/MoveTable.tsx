import { Fragment, useEffect, useRef } from 'react'
import type { Move } from '../lib/convert'
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_SYMBOL,
  hasMoveMarker,
} from '../lib/engine/analysis'
import type { Classification, GameAnalysis, MoveAnalysis } from '../lib/engine/analysis'
import { formatScore } from '../lib/engine/uci'
import { classColor } from './ClassBadge'

interface MoveTableProps {
  moves: Move[]
  result: string | null
  /** Current ply: 0 = start, ply i = position after moves[i-1]. */
  ply: number
  onPlyChange: (ply: number) => void
  analysis: GameAnalysis | null
}

interface Cell {
  san: string
  ply: number
}

interface Row {
  number: number
  white: Cell | null
  black: Cell | null
}

/** Classifications that earn a "best move was…" note under the move. */
const NEEDS_ADVICE: Classification[] = ['inaccuracy', 'mistake', 'blunder']

export default function MoveTable({
  moves,
  result,
  ply,
  onPlyChange,
  analysis,
}: MoveTableProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  /** Rows of the game kept visible above the current move. */
  const CONTEXT_ROWS = 2

  /**
   * Keep the current move in view by scrolling the list itself.
   *
   * scrollIntoView would be shorter, but it scrolls whichever ancestor happens
   * to be scrollable — on a phone that is the page, so stepping through the
   * game dragged the board off the top of the screen. Setting scrollTop can
   * only ever move this list, and does nothing when it is not scrollable.
   */
  useEffect(() => {
    const list = listRef.current
    const current = currentRef.current
    if (!list || !current) return

    // Rects, not offsetTop: the move sits inside a table cell, so its
    // offsetParent is that cell rather than this list and offsetTop measures
    // from the wrong origin.
    const listBox = list.getBoundingClientRect()
    const moveBox = current.getBoundingClientRect()

    // Park the move near the top with a couple of rows of the game still above
    // it, rather than only nudging it barely into view. Stepping forward then
    // advances the list a row at a time and what comes next is already on
    // screen. Clamping is left to the browser: at the start of the game there
    // is nothing above to show, and at the end nothing below.
    const target = list.scrollTop + (moveBox.top - listBox.top) - CONTEXT_ROWS * moveBox.height
    list.scrollTop = Math.max(0, target)
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

  const analysisFor = (cell: Cell | null): MoveAnalysis | null =>
    cell ? (analysis?.moves[cell.ply - 1] ?? null) : null

  const moveCell = (cell: Cell | null) => {
    if (!cell) return <td className="px-2 text-ink-mute">…</td>
    const current = cell.ply === ply
    const info = analysisFor(cell)
    const color = info ? classColor(info.classification) : undefined
    return (
      <td className="py-0.5 pr-1">
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
          {info && hasMoveMarker(info.classification) && (
            <span className="ml-1 text-[10px] font-bold" aria-hidden="true">
              {CLASSIFICATION_SYMBOL[info.classification]}
            </span>
          )}
        </button>
      </td>
    )
  }

  /** Evaluation after the move, in one muted colour regardless of value. */
  const evalCell = (cell: Cell | null) => {
    const info = analysisFor(cell)
    return (
      <td className="py-0.5 pr-2 text-right font-score text-xs text-ink-mute tabular-nums">
        {info ? formatScore(info.scoreAfter) : ''}
      </td>
    )
  }

  /** "Inaccuracy. c4 was best." shown beneath a flagged move. */
  const adviceRow = (cell: Cell, info: MoveAnalysis) => {
    const color = classColor(info.classification)
    return (
      <tr key={`advice-${cell.ply}`}>
        <td />
        <td colSpan={4} className="pb-1 pr-2">
          <button
            type="button"
            onClick={() => onPlyChange(cell.ply)}
            className="block w-full rounded-r border-l-[3px] px-2 py-0.5 text-left text-[11px] transition-opacity hover:opacity-80"
            style={{
              borderColor: color,
              color,
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
          >
            {CLASSIFICATION_LABEL[info.classification]}.
            {info.bestMoveSan ? (
              <>
                {' '}
                <span className="font-score font-semibold">{info.bestMoveSan}</span> was best.
              </>
            ) : null}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <section
      aria-label="Moves"
      className="flex max-h-80 min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule bg-card shadow-sm sm:max-h-none"
    >
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-1 pt-2">
        <table className="w-full border-collapse">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-12" />
            <col />
            <col className="w-12" />
          </colgroup>
          <tbody>
            {rows.map((row) => {
              const whiteInfo = analysisFor(row.white)
              const blackInfo = analysisFor(row.black)
              const advice: React.ReactNode[] = []
              if (row.white && whiteInfo && NEEDS_ADVICE.includes(whiteInfo.classification)) {
                advice.push(adviceRow(row.white, whiteInfo))
              }
              if (row.black && blackInfo && NEEDS_ADVICE.includes(blackInfo.classification)) {
                advice.push(adviceRow(row.black, blackInfo))
              }
              return (
                <Fragment key={row.number}>
                  <tr className="border-t border-rule/60">
                    <td className="px-1 py-0.5 text-right font-score text-xs text-ink-mute">
                      {row.number}.
                    </td>
                    {moveCell(row.white)}
                    {evalCell(row.white)}
                    {moveCell(row.black)}
                    {evalCell(row.black)}
                  </tr>
                  {advice}
                </Fragment>
              )
            })}
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
