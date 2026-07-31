import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Classification, GameAnalysis } from '../lib/engine/analysis'
import { formatScore } from '../lib/engine/uci'
import type { Move } from '../lib/convert'
import { classColor } from './ClassBadge'

interface EvalChartProps {
  analysis: GameAnalysis
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
}

interface EvalRow {
  ply: number
  /** Eval in pawns clipped to ±10 for the chart. */
  ev: number
  label: string
  scoreText: string
  /** Classification of the move that reached this position, if it earns a dot. */
  dotClass: Classification | null
}

/** Classifications marked on the line — the ones worth finding at a glance. */
const DOTTED: Classification[] = ['best', 'inaccuracy', 'mistake', 'blunder']

/**
 * Recharts calls this for every point; only flagged moves get a dot, the rest
 * render an empty group.
 */
function ClassDot(props: { cx?: number; cy?: number; index?: number; payload?: EvalRow }) {
  const { cx, cy, index, payload } = props
  if (cx == null || cy == null || !payload?.dotClass) return <g key={`dot-${index}`} />
  return (
    <circle
      key={`dot-${index}`}
      cx={cx}
      cy={cy}
      r={3.2}
      fill={classColor(payload.dotClass)}
      stroke="var(--card)"
      strokeWidth={1}
    />
  )
}

function moveLabel(moves: Move[], ply: number): string {
  if (ply === 0) return 'Start'
  const move = moves[ply - 1]
  if (!move) return `Ply ${ply}`
  return `${move.number}${move.color === 'w' ? '.' : '...'} ${move.san}`
}

function EvalTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload: EvalRow }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-rule bg-card px-3 py-1.5 text-xs shadow-md">
      <span className="font-score font-semibold">{row.label}</span>
      <span className="ml-2 text-ink-mute">{row.scoreText}</span>
    </div>
  )
}

export default function EvalChart({ analysis, moves, ply, onPlyChange }: EvalChartProps) {
  const rows: EvalRow[] = analysis.evals.map((score, i) => {
    const pawns =
      score.mate != null ? (score.mate > 0 ? 10 : -10) : Math.max(-10, Math.min(10, (score.cp ?? 0) / 100))
    // Row i is the position after move i, so the dot lands on the move that
    // produced it; the starting position has no move behind it.
    const classification = i > 0 ? (analysis.moves[i - 1]?.classification ?? null) : null
    return {
      ply: i,
      ev: pawns,
      label: moveLabel(moves, i),
      scoreText: formatScore(score),
      dotClass: classification && DOTTED.includes(classification) ? classification : null,
    }
  })

  return (
    <div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          onClick={(state) => {
            const label = state?.activeLabel
            if (label != null) onPlyChange(Number(label))
          }}
        >
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="ply"
            type="number"
            domain={[0, rows.length - 1]}
            tickFormatter={(p: number) => String(Math.max(1, Math.ceil(p / 2)))}
            tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
          />
          <YAxis
            domain={[-10, 10]}
            ticks={[-10, -5, 0, 5, 10]}
            tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
            tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<EvalTooltip />} cursor={{ stroke: 'var(--chart-axis)' }} />
          <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 3" />
          {analysis.middlegameStartPly != null && (
            <ReferenceLine
              x={analysis.middlegameStartPly}
              stroke="var(--class-inaccuracy)"
              strokeDasharray="4 3"
              label={{
                value: 'Middlegame',
                angle: -90,
                position: 'insideBottomLeft',
                fontSize: 10,
                fill: 'var(--class-inaccuracy)',
              }}
            />
          )}
          {analysis.endgameStartPly != null && (
            <ReferenceLine
              x={analysis.endgameStartPly}
              stroke="var(--class-blunder)"
              strokeDasharray="4 3"
              label={{
                value: 'Endgame',
                angle: -90,
                position: 'insideBottomLeft',
                fontSize: 10,
                fill: 'var(--class-blunder)',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="ev"
            baseValue={0}
            stroke="var(--eval-fill)"
            strokeWidth={1.5}
            fill="var(--eval-fill)"
            fillOpacity={0.55}
            isAnimationActive={false}
            dot={<ClassDot />}
          />
          <ReferenceLine x={ply} stroke="var(--accent-bright)" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
