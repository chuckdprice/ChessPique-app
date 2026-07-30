import { CLASSIFICATIONS, CLASSIFICATION_LABEL } from '../lib/engine/analysis'
import type { GameAnalysis, PlayerSummary } from '../lib/engine/analysis'
import ClassBadge, { classColor } from './ClassBadge'

interface ClassificationTableProps {
  analysis: GameAnalysis
  whiteName: string
  blackName: string
  /** Rating from the PGN tag, printed before the name. */
  whiteElo: string | null
  blackElo: string | null
  playedLikeTooltip: string
}

export default function ClassificationTable({
  analysis,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
  playedLikeTooltip,
}: ClassificationTableProps) {
  const whiteTotal = analysis.moves.filter((m) => m.color === 'w').length
  const blackTotal = analysis.moves.filter((m) => m.color === 'b').length

  const cell = (count: number, total: number, color: string, align: 'right' | 'left') => (
    <td className={`px-4 py-1 font-score text-sm tabular-nums ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className="font-semibold" style={{ color }}>
        {count}
      </span>{' '}
      <span className="text-xs text-ink-mute">
        ({total === 0 ? 0 : Math.round((count / total) * 100)}%)
      </span>
    </td>
  )

  /** "719 Chuck Price (87.3%)" over "played like ~1600 Lichess Rapid". */
  const heading = (
    name: string,
    elo: string | null,
    summary: PlayerSummary,
    align: 'left' | 'right',
  ) => (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <p className="max-w-52 truncate">
        {elo && <span className="mr-1.5 font-score text-xs">{elo}</span>}
        {name}
        <span className="ml-1.5 font-score text-xs">({summary.accuracy.toFixed(1)}%)</span>
      </p>
      <p
        className="cursor-help font-score text-[11px] text-ink-mute"
        title={playedLikeTooltip}
      >
        played like ~{summary.playedLike} Lichess Rapid
      </p>
    </div>
  )

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-start justify-between gap-4 px-4 pb-1 text-sm text-ink-mute">
        {heading(whiteName, whiteElo, analysis.white, 'left')}
        {heading(blackName, blackElo, analysis.black, 'right')}
      </div>
      <table className="w-full">
        <tbody>
          {CLASSIFICATIONS.map((c) => (
            <tr key={c} className="border-t border-rule/60">
              {cell(analysis.white.counts[c], whiteTotal, classColor(c), 'right')}
              <td className="px-4 py-1">
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
