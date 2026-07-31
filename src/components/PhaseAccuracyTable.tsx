import type { GameAnalysis, PhaseAccuracy } from '../lib/engine/analysis'

interface PhaseAccuracyTableProps {
  analysis: GameAnalysis
  whiteName: string
  blackName: string
}

function AccuracyCell({ value }: { value: number | null }) {
  return (
    <td className="px-2 py-1 text-center font-score text-xs font-semibold text-class-best">
      {value == null ? '—' : `${value.toFixed(1)}%`}
    </td>
  )
}

/**
 * Accuracy broken out by game phase, one row per player. A phase reads "—" when
 * the game never reached it, or ended before either side moved in it.
 */
export default function PhaseAccuracyTable({
  analysis,
  whiteName,
  blackName,
}: PhaseAccuracyTableProps) {
  const accuracyRow = (name: string, acc: PhaseAccuracy, overall: number) => (
    <tr className="border-t border-rule/60">
      <td className="max-w-40 truncate px-2 py-1 text-xs">{name}</td>
      <AccuracyCell value={acc.opening} />
      <AccuracyCell value={acc.middlegame} />
      <AccuracyCell value={acc.endgame} />
      <AccuracyCell value={overall} />
    </tr>
  )

  return (
    <div className="mx-auto max-w-xl overflow-x-auto">
      <table className="w-full min-w-96">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-ink-mute">
            <th className="px-2 py-0.5 text-left font-medium"> </th>
            <th className="px-2 py-0.5 text-center font-medium">Opening</th>
            <th className="px-2 py-0.5 text-center font-medium">Middle</th>
            <th className="px-2 py-0.5 text-center font-medium">End</th>
            <th className="px-2 py-0.5 text-center font-medium">Game</th>
          </tr>
        </thead>
        <tbody>
          {accuracyRow(whiteName, analysis.white.phaseAccuracy, analysis.white.accuracy)}
          {accuracyRow(blackName, analysis.black.phaseAccuracy, analysis.black.accuracy)}
        </tbody>
      </table>
    </div>
  )
}
