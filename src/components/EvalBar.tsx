import { winPct } from '../lib/engine/analysis'
import { formatScore } from '../lib/engine/uci'
import type { Score } from '../lib/engine/uci'

interface EvalBarProps {
  score: Score | null
  orientation: 'white' | 'black'
}

/** Vertical evaluation bar beside the board; the white share = White's win %. */
export default function EvalBar({ score, orientation }: EvalBarProps) {
  const pct = score ? winPct(score) : 50
  const whiteOnBottom = orientation === 'white'
  const whiteAhead = pct >= 50

  return (
    <div
      role="meter"
      aria-label="Engine evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={score ? formatScore(score) : 'no evaluation'}
      className="relative w-6 self-stretch overflow-hidden rounded-md border border-rule bg-[#3a3733]"
    >
      <div
        className="absolute inset-x-0 bg-[#f0ece1] transition-[height] duration-300"
        style={{
          height: `${pct}%`,
          [whiteOnBottom ? 'bottom' : 'top']: 0,
        }}
      />
      {score && (
        <span
          className={`absolute inset-x-0 text-center font-score text-[9px] font-semibold ${
            whiteAhead === whiteOnBottom ? 'bottom-1' : 'top-1'
          } ${whiteAhead ? 'text-[#3a3733]' : 'text-[#f0ece1]'}`}
        >
          {formatScore(score).replace('+', '')}
        </span>
      )}
    </div>
  )
}
