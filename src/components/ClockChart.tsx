import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatClockTime } from '../lib/convert'
import type { ChartRow } from '../lib/gameModel'

interface ClockChartProps {
  rows: ChartRow[]
  /** Null when the PGN carried no time control to scale the clock axis by. */
  startSeconds: number | null
  whiteName: string
  blackName: string
  /** Render without the outer card chrome (for use inside the analysis tabs). */
  embedded?: boolean
}

const WHITE_COLOR = 'var(--white-series-line)'
const WHITE_FILL = 'var(--white-series-fill)'
const BLACK_COLOR = 'var(--black-series-line)'
const BLACK_FILL = 'var(--black-series-fill)'

function formatMinSec(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Evenly spaced ticks on a 0-based axis, snapped to clock-friendly steps. */
function clockTicks(maxSeconds: number): number[] {
  const steps = [60, 120, 300, 600, 900, 1200, 1800, 3600]
  const step = steps.find((s) => maxSeconds / s <= 6) ?? 7200
  const ticks: number[] = []
  for (let t = 0; t <= maxSeconds; t += step) ticks.push(t)
  // Label the domain top (the full time control) even when it is off-step.
  if (ticks[ticks.length - 1] !== maxSeconds) ticks.push(maxSeconds)
  return ticks
}

interface TooltipContentProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload: ChartRow }>
  whiteName: string
  blackName: string
}

function ChartTooltip({ active, payload, whiteName, blackName }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  const side = (
    name: string,
    san: string | null,
    clk: number | null,
    emt: number | null,
    swatch: string,
  ) =>
    san && (
      <div className="mt-1 flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className="inline-block size-2.5 shrink-0 self-center rounded-sm border border-rule"
          style={{ backgroundColor: swatch }}
        />
        <span className="font-score">{san}</span>
        <span className="text-ink-mute">
          {name} · spent {emt != null ? formatMinSec(emt) : '—'} · left{' '}
          {clk != null ? formatClockTime(clk) : '—'}
        </span>
      </div>
    )
  return (
    <div className="rounded-lg border border-rule bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">Move {row.moveNumber}</p>
      {side(whiteName, row.whiteSan, row.whiteClk, row.whiteSpent, WHITE_FILL)}
      {side(blackName, row.blackSan, row.blackClk, row.blackSpent, BLACK_FILL)}
    </div>
  )
}

export default function ClockChart({
  rows,
  startSeconds,
  whiteName,
  blackName,
  embedded = false,
}: ClockChartProps) {
  const hasClocks = rows.some((r) => r.whiteClk != null || r.blackClk != null)
  const hasSpent = rows.some((r) => r.whiteSpent != null || r.blackSpent != null)
  // Without a declared time control the axis still has to reach the highest
  // clock the game actually shows.
  const maxClock = Math.max(
    startSeconds ?? 0,
    ...rows.flatMap((r) => [r.whiteClk ?? 0, r.blackClk ?? 0]),
  )

  if (!hasClocks && !hasSpent) {
    return (
      <section
        aria-label="Clock chart"
        className={embedded ? '' : 'rounded-xl border border-rule bg-card shadow-sm'}
      >
        <p className="px-6 py-10 text-center text-sm text-ink-mute">
          This PGN has no clock times, so there is nothing to chart. Everything else on the
          analysis page still works.
        </p>
      </section>
    )
  }

  const legendItem = (label: string, swatch: string, shape: 'line' | 'bar') => (
    <span className="flex items-center gap-1.5">
      {shape === 'line' ? (
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-5 rounded-full"
          style={{ backgroundColor: swatch }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-2.5 rounded-t-sm border border-rule"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </span>
  )

  return (
    <section
      aria-label="Clock chart"
      className={embedded ? '' : 'rounded-xl border border-rule bg-card shadow-sm'}
    >
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 ${
          embedded ? 'py-0' : 'border-b border-rule py-4'
        }`}
      >
        {!embedded && (
          <div>
            <h2 className="font-display text-lg font-semibold">Time usage</h2>
            <p className="mt-0.5 text-sm text-ink-mute">
              Lines show time remaining (left axis). Bars show time spent on each move (right
              axis).
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
          {legendItem(`${whiteName} — remaining`, WHITE_COLOR, 'line')}
          {legendItem(`${blackName} — remaining`, BLACK_COLOR, 'line')}
          {legendItem(`${whiteName} — per move`, WHITE_FILL, 'bar')}
          {legendItem(`${blackName} — per move`, BLACK_FILL, 'bar')}
        </div>
      </div>
      <div className={embedded ? 'px-2 pt-1' : 'px-2 py-4'}>
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 12 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="moveNumber"
              tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              interval="preserveStartEnd"
              label={{
                value: 'Move number',
                position: 'insideBottom',
                offset: -2,
                fontSize: 11,
                fill: 'var(--chart-tick)',
              }}
            />
            <YAxis
              yAxisId="clock"
              domain={[0, maxClock]}
              ticks={clockTicks(maxClock)}
              tickFormatter={formatClockTime}
              tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
              tickLine={false}
              axisLine={false}
              width={58}
              label={{
                value: 'Time remaining',
                angle: -90,
                position: 'insideLeft',
                offset: -4,
                fontSize: 11,
                fill: 'var(--chart-tick)',
                style: { textAnchor: 'middle' },
              }}
            />
            <YAxis
              yAxisId="emt"
              orientation="right"
              tickFormatter={formatMinSec}
              tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
              tickLine={false}
              axisLine={false}
              width={48}
              label={{
                value: 'Time per move',
                angle: 90,
                position: 'insideRight',
                offset: -2,
                fontSize: 11,
                fill: 'var(--chart-tick)',
                style: { textAnchor: 'middle' },
              }}
            />
            <Tooltip
              content={<ChartTooltip whiteName={whiteName} blackName={blackName} />}
              cursor={{ fill: 'var(--chart-grid)', fillOpacity: 0.45 }}
            />
            {/*
              Animation off, as on the eval chart. The engine review re-renders
              this chart once per reviewed position, which restarts the grow-in
              animation every time — for a long game the bars sit at their
              zero-height first frame for the whole review and read as missing.
            */}
            <Bar
              yAxisId="emt"
              dataKey="whiteSpent"
              fill={WHITE_FILL}
              stroke={WHITE_COLOR}
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="emt"
              dataKey="blackSpent"
              fill={BLACK_FILL}
              stroke="var(--black-series-stroke)"
              strokeWidth={1}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              isAnimationActive={false}
            />
            <Line
              yAxisId="clock"
              type="monotone"
              dataKey="whiteClk"
              stroke={WHITE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="clock"
              type="monotone"
              dataKey="blackClk"
              stroke={BLACK_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
