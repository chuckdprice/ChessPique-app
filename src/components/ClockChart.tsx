import { useEffect, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { formatClockDisplay } from '../lib/convert'
import { plyForClockClick } from '../lib/gameModel'
import type { ChartRow } from '../lib/gameModel'

interface ClockChartProps {
  rows: ChartRow[]
  /** Null when the PGN carried no time control to scale the clock axis by. */
  startSeconds: number | null
  whiteName: string
  blackName: string
  /** Jump the board to a move, as clicking the evaluation chart does. */
  onPlyChange?: (ply: number) => void
  /** The ply the board is on, marked with a line as on the evaluation chart. */
  ply?: number
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

const CHART_MARGIN = { top: 8, right: 8, bottom: 4, left: 12 }
const CLOCK_AXIS_WIDTH = 58
const SPENT_AXIS_WIDTH = 48

/** One side's figure in a readout, with the swatch that identifies it. */
function Figure({ swatch, value }: { swatch: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        aria-hidden="true"
        className="inline-block size-2 shrink-0 self-center rounded-sm border border-rule"
        style={{ backgroundColor: swatch }}
      />
      <span className="font-score tabular-nums">{value}</span>
    </span>
  )
}

/**
 * The two readouts, in place of a tooltip.
 *
 * A popover following the pointer covered the very bars it was describing —
 * on a 150px chart there is nowhere for it to go that is not on top of
 * something. These sit above the plot instead, left and right, and only their
 * numbers change as the pointer moves. Fixed height, because a row that
 * appears on hover would nudge the chart down under the pointer.
 */
function Readout({
  row,
  whiteName,
  blackName,
  hovering,
}: {
  row: ChartRow | null
  whiteName: string
  blackName: string
  hovering: boolean
}) {
  const value = (seconds: number | null, format: (s: number) => string) =>
    seconds == null ? '—' : format(seconds)
  return (
    <div className="flex h-5 items-baseline justify-between gap-2 px-2 text-[11px] text-ink-mute">
      <span className="flex items-baseline gap-2">
        <span className="text-ink-mute/80">left</span>
        {row && (
          <>
            <Figure swatch={WHITE_FILL} value={value(row.whiteClk, formatClockDisplay)} />
            <Figure swatch={BLACK_FILL} value={value(row.blackClk, formatClockDisplay)} />
          </>
        )}
      </span>

      {/* The move the figures belong to, between them: with two readouts and
          no pointer on the chart it is the only thing saying which move is
          being reported, and it says whether that is the hover or the board. */}
      <span className="truncate font-score text-ink">
        {row ? `${row.moveNumber}. ${row.whiteSan ?? '…'} ${row.blackSan ?? ''}`.trim() : ''}
        {row && !hovering && <span className="ml-1 text-ink-mute/80">(on board)</span>}
      </span>

      <span className="flex items-baseline gap-2">
        {row && (
          <>
            <Figure swatch={WHITE_FILL} value={value(row.whiteSpent, formatMinSec)} />
            <Figure swatch={BLACK_FILL} value={value(row.blackSpent, formatMinSec)} />
          </>
        )}
        <span className="text-ink-mute/80">spent</span>
        <span className="sr-only">
          {whiteName} and {blackName}
        </span>
      </span>
    </div>
  )
}

export default function ClockChart({
  rows,
  startSeconds,
  whiteName,
  blackName,
  onPlyChange,
  ply,
  embedded = false,
}: ClockChartProps) {
  // Which move the readouts are reporting: whatever the pointer is over, and
  // the board's own move when it is not over anything.
  const [hoveredNumber, setHoveredNumber] = useState<number | null>(null)

  // Moving the board drops the hover. Without this, clicking the chart and
  // then stepping on with the arrow keys left the row still reporting the move
  // under a stationary pointer while the marker had moved on — the readout
  // going quietly stale in the same way the second line used to.
  useEffect(() => setHoveredNumber(null), [ply])
  const hasClocks = rows.some((r) => r.whiteClk != null || r.blackClk != null)
  const hasSpent = rows.some((r) => r.whiteSpent != null || r.blackSpent != null)
  // Without a declared time control the axis still has to reach the highest
  // clock the game actually shows.
  const maxClock = Math.max(
    startSeconds ?? 0,
    ...rows.flatMap((r) => [r.whiteClk ?? 0, r.blackClk ?? 0]),
  )
  const boardRow = ply != null ? rows.find((r) => r.whitePly === ply || r.blackPly === ply) : null
  const reported = rows.find((r) => r.moveNumber === hoveredNumber) ?? boardRow ?? null

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
      <Readout
        row={reported}
        whiteName={whiteName}
        blackName={blackName}
        hovering={hoveredNumber != null}
      />
      <div className={embedded ? 'px-2 pt-1' : 'px-2 py-4'}>
        {/* This box is exactly the chart's — the padding is on the wrapper
            above it — because the pointer arithmetic below measures from its
            edges, and 8px of padding inside it would read the wrong move. */}
        <div
          data-clock-plot
          // Worked out from the pointer's position, the same way the click
          // handler does and for the same reason: recharts' own
          // active-tooltip state is not reliable to read from here — a
          // mousemove that reaches this element still left `activeLabel`
          // undefined, measured in the running app.
          onMouseMove={(event) => {
            const at = plyForClockClick(
              rows,
              event.currentTarget.getBoundingClientRect(),
              event.clientX,
            )
            const row =
              at == null ? null : rows.find((r) => r.whitePly === at || r.blackPly === at)
            setHoveredNumber(row?.moveNumber ?? null)
          }}
          onMouseLeave={() => setHoveredNumber(null)}
        >
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart
            data={rows}
            margin={CHART_MARGIN}
            /*
              Off, because it fights the app for the arrow keys.

              Recharts' accessibility layer gives the chart focus on click and
              then answers ArrowLeft/ArrowRight itself by walking its own
              active index — one *move* per press, while the board walks one
              *ply*. Click the chart and step on with the arrows and the two
              are immediately out of step, which is the second half of the
              desync Chuck reported: recharts never calls preventDefault, so
              one key press moved both.

              Nothing is lost. The keyboard path here is the app's own, which
              moves the board, and the board is what this chart marks.
            */
            accessibilityLayer={false}
            style={onPlyChange ? { cursor: 'pointer' } : undefined}
            onClick={(_state, event) => {
              if (!onPlyChange) return
              const at = plyForClockClick(
                rows,
                event.currentTarget.getBoundingClientRect(),
                event.clientX,
              )
              if (at != null) onPlyChange(at)
            }}
          >
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
              tickFormatter={formatClockDisplay}
              tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
              tickLine={false}
              axisLine={false}
              width={CLOCK_AXIS_WIDTH}
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
              width={SPENT_AXIS_WIDTH}
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
            {/*
              The move on the board, and nothing else, marks the chart.

              There is deliberately no Tooltip here at all. Its cursor drew a
              second vertical line and its `activeDot` drew the two dots on the
              clock lines — all three following the *pointer* while the line
              below follows the *board*. Click the chart and they agree; step
              on with the arrow keys and they do not, which is exactly the
              desync Chuck reported. One indicator, one input.

              ReferenceLine and ReferenceDot rather than an overlay of our own
              because recharts places them with its own scales: the dots land
              on the curves without this file knowing anything about the
              chart's vertical geometry, which is not something it could work
              out honestly.
            */}
            {boardRow && (
              <>
                <ReferenceLine
                  yAxisId="clock"
                  x={boardRow.moveNumber}
                  stroke="var(--accent-bright)"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
                {boardRow.whiteClk != null && (
                  <ReferenceDot
                    yAxisId="clock"
                    x={boardRow.moveNumber}
                    y={boardRow.whiteClk}
                    r={4}
                    fill={WHITE_FILL}
                    stroke={WHITE_COLOR}
                    strokeWidth={1.5}
                  />
                )}
                {boardRow.blackClk != null && (
                  <ReferenceDot
                    yAxisId="clock"
                    x={boardRow.moveNumber}
                    y={boardRow.blackClk}
                    r={4}
                    fill={BLACK_FILL}
                    stroke={BLACK_COLOR}
                    strokeWidth={1.5}
                  />
                )}
              </>
            )}
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
              isAnimationActive={false}
            />
            <Line
              yAxisId="clock"
              type="monotone"
              dataKey="blackClk"
              stroke={BLACK_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </div>
    </section>
  )
}
