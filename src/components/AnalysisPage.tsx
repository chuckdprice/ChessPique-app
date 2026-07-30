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
  whiteRating: string | null
  blackRating: string | null
  ratingTooltip: string
  evalScore: Score | null
  showEvalBar: boolean
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
  whiteRating,
  blackRating,
  ratingTooltip,
  evalScore,
  showEvalBar,
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
  const startSeconds = result.timeControl.startSeconds

  const whitePlate: PlayerPlate = {
    name: whiteName,
    rating: whiteRating,
    clock: clockAtPly(moves, ply, 'w', startSeconds),
  }
  const blackPlate: PlayerPlate = {
    name: blackName,
    rating: blackRating,
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
          gridTemplateColumns: showEvalBar
            ? 'auto var(--board-size) minmax(15rem, 1fr)'
            : 'var(--board-size) minmax(15rem, 1fr)',
          gridTemplateRows: 'auto var(--board-size) auto auto minmax(0, 1fr)',
        }}
      >
        {/* Row 1 — plate above the board */}
        {showEvalBar && <div />}
        <div className="min-w-0">
          <PlayerPlateRow plate={topPlate} color={topColor} ratingTooltip={ratingTooltip} />
        </div>
        <div />

        {/* Row 2 — eval bar, board, and the right column that aligns to them */}
        {showEvalBar && <EvalBar score={evalScore} orientation={orientation} />}
        <BoardViewer
          replay={replay}
          ply={ply}
          orientation={orientation}
          analysis={analysis}
          arrows={arrows}
        />
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
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

        {/* Row 3 — plate below the board */}
        {showEvalBar && <div />}
        <div className="min-w-0">
          <PlayerPlateRow
            plate={bottomPlate}
            color={bottomColor}
            ratingTooltip={ratingTooltip}
          />
        </div>
        <div />

        {/* Row 4 — navigation, spanning the full width */}
        <div style={{ gridColumn: '1 / -1' }} className="pt-1">
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
        <div style={{ gridColumn: '1 / -1' }} className="min-h-0">
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
          />
        </div>
      </div>
    </div>
  )
}
