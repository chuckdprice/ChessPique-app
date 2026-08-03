import { useEffect, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import type { ConvertResult, Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { Score } from '../lib/engine/uci'
import type { EngineSettings } from '../lib/settings'
import type { ChartRow, ReplayedGame } from '../lib/gameModel'
import { clockAtPly } from '../lib/gameModel'
import type { Opening } from '../lib/openings'
import { findOpening } from '../lib/openings'
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

/** The game's opening, once the book has loaded; null until then and if unnamed. */
function useOpening(fens: string[]): Opening | null {
  const [opening, setOpening] = useState<Opening | null>(null)

  useEffect(() => {
    let current = true
    setOpening(null)
    findOpening(fens).then((found) => {
      if (current) setOpening(found)
    })
    return () => {
      current = false
    }
  }, [fens])

  return opening
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
  const opening = useOpening(replay.fens)
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

      {/* Shape lives in .analysis-grid in index.css so it can change at lg. */}
      <div className="analysis-grid min-h-0 lg:flex-1">
        <div className="area-plate-top min-w-0">
          <PlayerPlateRow plate={topPlate} color={topColor} accuracyTooltip={accuracyTooltip} />
        </div>

        <div className="area-eval-bar flex">
          <EvalBar score={evalScore} orientation={orientation} />
        </div>

        <div className="area-board">
          <BoardViewer
            replay={replay}
            ply={ply}
            orientation={orientation}
            analysis={analysis}
            arrows={arrows}
          />
        </div>

        <div className="area-captured">
          <CapturedStrip fen={replay.fens[ply]} orientation={orientation} />
        </div>

        {/* On lg this spans rows 1-3, so the engine pane's top lines up with the
            top player's name and the move list's bottom with the bottom one's.
            On a phone it sits below the board at natural height. */}
        {/* overflow-hidden from sm up, where this spans the three board rows:
            left to grow it stretches them, and the board block was 234px tall
            around a 180px board with the nav pushed off the bottom. */}
        <div className="area-side flex min-h-0 flex-col gap-2 sm:overflow-hidden">
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

        <div className="area-plate-bottom min-w-0">
          <PlayerPlateRow
            plate={bottomPlate}
            color={bottomColor}
            accuracyTooltip={accuracyTooltip}
          />
        </div>

        <div className="area-nav flex justify-center pt-1">
          <BoardNav
            moves={moves}
            ply={ply}
            lastPly={lastPly}
            onPlyChange={onPlyChange}
            onRotate={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            orientation={orientation}
          />
        </div>

        {/* Charts, spanning the full width so the edges line up */}
        <div className="area-tabs min-h-0">
          <AnalysisTabs
            analysis={analysis}
            progress={analysisProgress}
            analysisError={analysisError}
            moves={moves}
            ply={ply}
            onPlyChange={onPlyChange}
            chartRows={chartRows}
            startSeconds={startSeconds}
            opening={opening}
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
