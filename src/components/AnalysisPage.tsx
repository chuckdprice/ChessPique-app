import { useState } from 'react'
import type { Arrow } from 'react-chessboard'
import type { ConvertResult, Move } from '../lib/convert'
import type { GameAnalysis, RefinedEval } from '../lib/engine/analysis'
import type { Score } from '../lib/engine/uci'
import type { EngineSettings } from '../lib/settings'
import type { ChartRow } from '../lib/gameModel'
import { capturedMaterial, clockAtPly } from '../lib/gameModel'
import type { MoveTree } from '../lib/moveTree'
import type { Opening } from '../lib/openings'
import AnalysisProgress from './AnalysisProgress'
import AnalysisTabs from './AnalysisTabs'
import BoardViewer, { BoardNav, PlayerPlateRow } from './BoardViewer'
import type { PlayerPlate } from './BoardViewer'
import EnginePanel from './EnginePanel'
import EvalBar from './EvalBar'
import MoveTable from './MoveTable'

interface AnalysisPageProps {
  result: ConvertResult
  /** The game, variations and all. */
  tree: MoveTree
  /** The node the board is showing. */
  currentId: string
  onNavigate: (nodeId: string) => void
  /** The mainline as a list, for the charts and the clocks. */
  moves: Move[]
  /** Where the current position sits on the mainline; 0 inside a variation. */
  ply: number
  onPlyChange: (ply: number) => void
  analysis: GameAnalysis | null
  /** Evals the live engine has searched deeper than the review did, by node. */
  deeperEvals: Map<string, RefinedEval>
  /** Named opening for the evaluation chart's caption; null while it loads. */
  opening: Opening | null
  onPieceMove: (from: string, to: string) => boolean
  onPromote: (nodeId: string, toMainline: boolean) => void
  onDemote: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  analysisProgress: { done: number; total: number } | null
  analysisError: string | null
  chartRows: ChartRow[]
  whiteName: string
  blackName: string
  /** Rating from the PGN tag, shown in the Move Classification tab. */
  whiteElo: string | null
  blackElo: string | null
  playedLikeTooltip: string
  evalScore: Score | null
  engineOn: boolean
  onEngineOnChange: (on: boolean) => void
  engineSettings: EngineSettings
  onEngineSettingsChange: (next: EngineSettings) => void
  onTopScore: (score: Score | null, depth: number) => void
  onEngineMoves: (ucis: string[]) => void
  onCommentChange: (nodeId: string, comment: string) => void
  arrows: Arrow[]
  /** Piece set id from the appearance settings. */
  pieceSet: string
}

/**
 * The whole review in one screen. A single grid drives the alignment:
 * the right column occupies only the board's row, so the engine panel's top
 * and the move list's bottom line up with the board; the nav and chart rows
 * span every column, so the chart pane runs from the eval bar to the move list.
 */
export default function AnalysisPage({
  result,
  tree,
  currentId,
  onNavigate,
  moves,
  ply,
  onPlyChange,
  analysis,
  deeperEvals,
  opening,
  onPieceMove,
  onPromote,
  onDemote,
  onDelete,
  analysisProgress,
  analysisError,
  chartRows,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
  playedLikeTooltip,
  evalScore,
  engineOn,
  onEngineOnChange,
  engineSettings,
  onEngineSettingsChange,
  onTopScore,
  onEngineMoves,
  onCommentChange,
  arrows,
  pieceSet,
}: AnalysisPageProps) {
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const current = tree.nodes.get(currentId) ?? tree.nodes.get(tree.root)!
  // One position drives the board, the engine and the captured strip, wherever
  // in the tree it sits.
  const shownFen = current.fen
  // A game with no clocks anywhere shows none: falling back to the time control
  // would pin a full starting clock beside both players for every move.
  const hasClocks = moves.some((m) => m.clkSeconds != null)
  const startSeconds = hasClocks ? (result.timeControl?.startSeconds ?? null) : null

  // Each player's row shows what they are up, so it carries the *opponent's*
  // missing pieces, and the lead badge goes to whoever holds it.
  const captured = capturedMaterial(shownFen)
  const lead = Math.abs(captured.diff)
  const whitePlate: PlayerPlate = {
    name: whiteName,
    clock: clockAtPly(moves, ply, 'w', startSeconds),
    captured: captured.black,
    lead: captured.diff > 0 ? `+${lead}` : null,
  }
  const blackPlate: PlayerPlate = {
    name: blackName,
    clock: clockAtPly(moves, ply, 'b', startSeconds),
    captured: captured.white,
    lead: captured.diff < 0 ? `+${lead}` : null,
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
          <PlayerPlateRow plate={topPlate} color={topColor} />
        </div>

        <div className="area-eval-bar flex">
          <EvalBar score={evalScore} orientation={orientation} />
        </div>

        <div className="area-board">
          <BoardViewer
            tree={tree}
            currentId={currentId}
            orientation={orientation}
            analysis={analysis}
            arrows={arrows}
            onPieceMove={onPieceMove}
            pieceSet={pieceSet}
          />
        </div>

        {/* On lg this spans rows 1-3, so the engine pane's top lines up with the
            top player's name and the move list's bottom with the bottom one's.
            On a phone it sits below the board at natural height. */}
        {/* overflow-hidden from sm up, where this spans the three board rows:
            left to grow it stretches them, and the board block was 234px tall
            around a 180px board with the nav pushed off the bottom. */}
        <div className="area-side flex min-h-0 flex-col gap-2 sm:overflow-hidden">
          <EnginePanel
            fen={shownFen}
            enabled={engineOn}
            onEnabledChange={onEngineOnChange}
            settings={engineSettings}
            onSettingsChange={onEngineSettingsChange}
            onTopScore={onTopScore}
            onFirstMoves={onEngineMoves}
          />
          <MoveTable
            tree={tree}
            currentId={currentId}
            onNavigate={onNavigate}
            analysis={analysis}
            deeperEvals={deeperEvals}
            onPromote={onPromote}
            onDemote={onDemote}
            onDelete={onDelete}
          />
        </div>

        <div className="area-plate-bottom min-w-0">
          <PlayerPlateRow plate={bottomPlate} color={bottomColor} />
        </div>

        <div className="area-nav flex min-w-0 pt-1">
          <BoardNav
            tree={tree}
            currentId={currentId}
            onNavigate={onNavigate}
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
            commentNode={current}
            chartRows={chartRows}
            startSeconds={startSeconds}
            opening={opening}
            whiteName={whiteName}
            blackName={blackName}
            whiteElo={whiteElo}
            blackElo={blackElo}
            playedLikeTooltip={playedLikeTooltip}
            onCommentChange={onCommentChange}
          />
        </div>
      </div>
    </div>
  )
}
