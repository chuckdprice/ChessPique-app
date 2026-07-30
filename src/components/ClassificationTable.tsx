import { CLASSIFICATIONS, CLASSIFICATION_LABEL } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import ClassBadge, { classColor } from './ClassBadge'

interface ClassificationTableProps {
  analysis: GameAnalysis
  whiteName: string
  blackName: string
}

export default function ClassificationTable({
  analysis,
  whiteName,
  blackName,
}: ClassificationTableProps) {
  const whiteTotal = analysis.moves.filter((m) => m.color === 'w').length
  const blackTotal = analysis.moves.filter((m) => m.color === 'b').length

  const cell = (count: number, total: number, color: string, align: 'right' | 'left') => (
    <td className={`px-4 py-1.5 font-score text-sm tabular-nums ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className="font-semibold" style={{ color }}>
        {count}
      </span>{' '}
      <span className="text-xs text-ink-mute">
        ({total === 0 ? 0 : Math.round((count / total) * 100)}%)
      </span>
    </td>
  )

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-baseline justify-between px-4 pb-1 text-sm text-ink-mute">
        <span className="max-w-44 truncate">
          {whiteName}
          <span className="ml-1.5 font-score text-xs">({analysis.white.accuracy.toFixed(1)}%)</span>
        </span>
        <span className="max-w-44 truncate text-right">
          {blackName}
          <span className="ml-1.5 font-score text-xs">({analysis.black.accuracy.toFixed(1)}%)</span>
        </span>
      </div>
      <table className="w-full">
        <tbody>
          {CLASSIFICATIONS.map((c) => (
            <tr key={c} className="border-t border-rule/60">
              {cell(analysis.white.counts[c], whiteTotal, classColor(c), 'right')}
              <td className="px-4 py-1.5">
                <span className="flex items-center justify-center gap-2">
                  <ClassBadge classification={c} />
                  <span className="w-20 text-sm" style={{ color: classColor(c) }}>
                    {CLASSIFICATION_LABEL[c]}
                  </span>
                </span>
              </td>
              {cell(analysis.black.counts[c], blackTotal, classColor(c), 'left')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
