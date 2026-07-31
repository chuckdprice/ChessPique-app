import { useState } from 'react'
import type { Arrow } from 'react-chessboard'
import type { ConvertResult, Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { Score } from '../lib/engine/uci'
import type { EngineSettings } from '../lib/settings'
import type { ChartRow, ReplayedGame } from '../lib/gameModel'
import { clockAtPly } from '../lib/gameModel'
import AnalysisProgress from './AnalysisProgress'
import AnalysisTabs from './AnalysisTabs'
import BoardViewer, { BoardNav, PlayerPlateRow } from './BoardViewer'
import type { PlayerPlate } from './BoardViewer'
import CapturedStrip from './CapturedStrip'
import EnginePanel from './EnginePanel'
import EvalBar from './EvalBar'
import MoveTable from './MoveTable'

interface AnalysisPageProps {
  result: ConvertResult
  replay: ReplayedGame
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  analysis: GameAnalysis | null
  analysisProgress: { done: number; total: number } | null
  analysisError: string | null
  chartRows: ChartRow[]
  whiteName: string
  blackName: string
  /** Rating from the PGN tag, shown in the Move Classification tab. */
  whiteElo: string | null
  blackElo: string | null
  accuracyTooltip: string
  playedLikeTooltip: string
  evalScore: Score | null
  engineOn: boolean
  onEngineOnChange: (on: boolean) => void
  engineSettings: EngineSettings
  onEngineSettingsChange: (next: EngineSettings) => void
  onTopScore: (score: Score | null) => void
  onEngineMoves: (ucis: string[]) => void
  arrows: Arrow[]
}

/**
 * The whole review in one screen. A single grid drives the alignment:
 * the right column occupies only the board's row, so the engine panel's top
 * and the move list's bottom line up with the board; the nav and chart rows
 * span every column, so the chart pane runs from the eval bar to the move list.
 */
export default function AnalysisPage({
  result,
  replay,
  moves,
  ply,
  onPlyChange,
  analysis,
  analysisProgress,
  analysisError,
  chartRows,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
  accuracyTooltip,
  playedLikeTooltip,
  evalScore,
  engineOn,
  onEngineOnChange,
  engineSettings,
  onEngineSettingsChange,
  onTopScore,
  onEngineMoves,
  arrows,
}: AnalysisPageProps) {
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const lastPly = replay.fens.length - 1
  // A game with no clocks anywhere shows none: falling back to the time control
  // would pin a full starting clock beside both players for every move.
  const hasClocks = moves.some((m) => m.clkSeconds != null)
  const startSeconds = hasClocks ? (result.timeControl?.startSeconds ?? null) : null

  // Accuracy needs the whole review, so it stays a placeholder until then.
  const accuracyLabel = (accuracy: number | undefined) =>
    accuracy != null ? `(${accuracy.toFixed(1)}%)` : analysisProgress ? '(…)' : null

  const whitePlate: PlayerPlate = {
    name: whiteName,
    accuracy: accuracyLabel(analysis?.white.accuracy),
    clock: clockAtPly(moves, ply, 'w', startSeconds),
  }
  const blackPlate: PlayerPlate = {
    name: blackName,
    accuracy: accuracyLabel(analysis?.black.accuracy),
    clock: clockAtPly(moves, ply, 'b', startSeconds),
  }
  const topPlate = orientation === 'white' ? blackPlate : whitePlate
  const bottomPlate = orientation === 'white' ? whitePlate : blackPlate
  const topColor = orientation === 'white' ? 'b' : 'w'
  const bottomColor = orientation === 'white' ? 'w' : 'b'

  const reviewing = !analysis || analysisError

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {reviewing && <AnalysisProgress progress={analysisProgress} error={analysisError} />}

      <div
        className="grid min-h-0 flex-1 gap-x-3 gap-y-1"
        style={{
          gridTemplateColumns: 'auto var(--board-size) auto minmax(15rem, 1fr)',
          // The plate rows are fixed rather than auto: the right column spans
          // rows 1-3, and an auto row would stretch to fit its content instead
          // of ending level with the player names.
          gridTemplateRows: '2rem var(--board-size) 2rem auto minmax(0, 1fr)',
        }}
      >
        {/* Column 2, row 1 — plate above the board */}
        <div className="min-w-0" style={{ gridColumn: 2, gridRow: 1 }}>
          <PlayerPlateRow plate={topPlate} color={topColor} accuracyTooltip={accuracyTooltip} />
        </div>

        {/* Column 1, row 2 — eval bar beside the board */}
        <div style={{ gridColumn: 1, gridRow: 2 }} className="flex">
          <EvalBar score={evalScore} orientation={orientation} />
        </div>

        {/* Column 2, row 2 — the board */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <BoardViewer
            replay={replay}
            ply={ply}
            orientation={orientation}
            analysis={analysis}
            arrows={arrows}
          />
        </div>

        {/* Column 3, row 2 — captured material, centred on the board */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <CapturedStrip fen={replay.fens[ply]} orientation={orientation} />
        </div>

        {/* Column 4, rows 1-3 — so the engine pane's top lines up with the top
            player's name and the move list's bottom with the bottom player's. */}
        <div
          className="flex min-h-0 flex-col gap-2 overflow-hidden"
          style={{ gridColumn: 4, gridRow: '1 / span 3' }}
        >
          <EnginePanel
            fen={replay.fens[ply]}
            enabled={engineOn}
            onEnabledChange={onEngineOnChange}
            settings={engineSettings}
            onSettingsChange={onEngineSettingsChange}
            onTopScore={onTopScore}
            onFirstMoves={onEngineMoves}
          />
          <MoveTable
            moves={moves}
            result={result.result}
            ply={ply}
            onPlyChange={onPlyChange}
            analysis={analysis}
          />
        </div>

        {/* Column 2, row 3 — plate below the board */}
        <div className="min-w-0" style={{ gridColumn: 2, gridRow: 3 }}>
          <PlayerPlateRow
            plate={bottomPlate}
            color={bottomColor}
            accuracyTooltip={accuracyTooltip}
          />
        </div>

        {/* Column 2, row 4 — navigation, centred under the board */}
        <div style={{ gridColumn: 2, gridRow: 4 }} className="flex justify-center pt-1">
          <BoardNav
            moves={moves}
            ply={ply}
            lastPly={lastPly}
            onPlyChange={onPlyChange}
            onRotate={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            orientation={orientation}
          />
        </div>

        {/* Row 5 — charts, spanning the full width so the edges line up */}
        <div style={{ gridColumn: '1 / -1', gridRow: 5 }} className="min-h-0">
          <AnalysisTabs
            analysis={analysis}
            progress={analysisProgress}
            analysisError={analysisError}
            moves={moves}
            ply={ply}
            onPlyChange={onPlyChange}
            chartRows={chartRows}
            startSeconds={startSeconds}
            whiteName={whiteName}
            blackName={blackName}
            whiteElo={whiteElo}
            blackElo={blackElo}
            playedLikeTooltip={playedLikeTooltip}
          />
        </div>
      </div>
    </div>
  )
}
