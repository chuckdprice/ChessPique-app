import { useState } from 'react'
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
import { CLASSIFICATION_LABEL, CLASSIFICATIONS } from '../lib/engine/analysis'
import type { Classification, GameAnalysis } from '../lib/engine/analysis'
import { formatScore } from '../lib/engine/uci'
import type { Move } from '../lib/convert'
import type { Opening } from '../lib/openings'
import { loadEvalDots, saveEvalDots } from '../lib/settings'
import type { EvalDotSettings } from '../lib/settings'
import { classColor } from './ClassBadge'

interface EvalChartProps {
  analysis: GameAnalysis
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  /** Named opening, captioned over the chart; null while the book loads. */
  opening: Opening | null
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

/**
 * One tick per move number, stepping by 2 once a game is long enough that every
 * move would crowd the axis.
 *
 * The axis is plotted in plies, so a tick goes on the ply carrying that move's
 * white half — move m is plies 2m-1 and 2m — which puts the label under the
 * point it names. Left to itself recharts picks round *ply* numbers, which land
 * on arbitrary move numbers like 1, 8, 15, 23.
 */
function moveTicks(plyCount: number): number[] {
  const lastMove = Math.max(1, Math.ceil(plyCount / 2))
  const step = lastMove <= 30 ? 1 : 2
  const ticks: number[] = []
  for (let move = 1; move <= lastMove; move += step) ticks.push(move * 2 - 1)
  return ticks
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

/** One of the filter row's checkboxes: small, so the row fits under the plot. */
function DotToggle({
  checked,
  onChange,
  label,
  swatch,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** The colour of the dot this box controls, drawn beside it as its legend. */
  swatch?: string
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3 shrink-0 accent-[var(--accent)]"
      />
      {swatch && (
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </label>
  )
}

export default function EvalChart({ analysis, moves, ply, onPlyChange, opening }: EvalChartProps) {
  // Loaded once and saved on every change: switching to another tab unmounts
  // this chart, and filters that reset on the way back would have to be set
  // again every time.
  const [dots, setDots] = useState<EvalDotSettings>(loadEvalDots)
  const updateDots = (next: EvalDotSettings) => {
    setDots(next)
    saveEvalDots(next)
  }
  const toggleClass = (c: Classification, on: boolean) =>
    updateDots({
      ...dots,
      classes: CLASSIFICATIONS.filter((k) => (k === c ? on : dots.classes.includes(k))),
    })

  const rows: EvalRow[] = analysis.evals.map((score, i) => {
    const pawns =
      score.mate != null ? (score.mate > 0 ? 10 : -10) : Math.max(-10, Math.min(10, (score.cp ?? 0) / 100))
    // Row i is the position after move i, so the dot lands on the move that
    // produced it; the starting position has no move behind it.
    const classification = i > 0 ? (analysis.moves[i - 1]?.classification ?? null) : null
    // The side from the move itself rather than from the ply's parity: a game
    // set up from a position can start with Black to move.
    const color = moves[i - 1]?.color
    const sideShown = color === 'w' ? dots.white : color === 'b' ? dots.black : false
    return {
      ply: i,
      ev: pawns,
      label: moveLabel(moves, i),
      scoreText: formatScore(score),
      dotClass:
        classification && sideShown && dots.classes.includes(classification) ? classification : null,
    }
  })

  return (
    <div className="relative">
      {/*
        Sits inside the plot rather than above it: the chart pane is short, and
        the top-left corner is quiet in all but a game White wins outright.
        Clear of the y-axis labels, and click-through so it never eats a click
        meant for the chart underneath.
      */}
      {opening && (
        <p
          title={`${opening.name} — through move ${Math.ceil(opening.ply / 2)}`}
          className="pointer-events-none absolute left-11 top-1 z-10 max-w-[calc(100%-4rem)] truncate rounded bg-card/80 px-1.5 py-0.5 text-[11px] font-medium text-ink-mute"
        >
          <span className="font-score text-ink">{opening.eco}</span>: {opening.name}
        </p>
      )}
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          // The same reason as the clock chart: clicking this chart focuses
          // it, and recharts would then answer the arrow keys by walking its
          // own tooltip while the app's handler walks the board. One key, two
          // things moving, and the tooltip's line drifting away from the line
          // marking the position.
          accessibilityLayer={false}
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
            ticks={moveTicks(rows.length - 1)}
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
              stroke="var(--phase-middlegame)"
              strokeDasharray="4 3"
              label={{
                value: 'Middlegame',
                angle: -90,
                position: 'insideBottomLeft',
                fontSize: 10,
                fill: 'var(--phase-middlegame)',
              }}
            />
          )}
          {analysis.endgameStartPly != null && (
            <ReferenceLine
              x={analysis.endgameStartPly}
              stroke="var(--phase-endgame)"
              strokeDasharray="4 3"
              label={{
                value: 'Endgame',
                angle: -90,
                position: 'insideBottomLeft',
                fontSize: 10,
                fill: 'var(--phase-endgame)',
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
      {/*
        Under the plot rather than over it: the top-left corner already carries
        the opening, and anything drawn inside the plot covers the line.
        Clicking a box never reaches the chart's click handler, so filtering
        does not move the board.
      */}
      <div
        role="group"
        aria-label="Dots on the graph"
        className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 text-[11px] text-ink-mute"
      >
        <DotToggle
          label="White"
          checked={dots.white}
          onChange={(on) => updateDots({ ...dots, white: on })}
        />
        <DotToggle
          label="Black"
          checked={dots.black}
          onChange={(on) => updateDots({ ...dots, black: on })}
        />
        <span aria-hidden="true" className="h-3 w-px bg-rule" />
        {CLASSIFICATIONS.map((c) => (
          <DotToggle
            key={c}
            label={CLASSIFICATION_LABEL[c]}
            swatch={classColor(c)}
            checked={dots.classes.includes(c)}
            onChange={(on) => toggleClass(c, on)}
          />
        ))}
      </div>
    </div>
  )
}
