import { useState } from 'react'
import type { Arrow } from 'react-chessboard'
import type { ConvertResult, Move } from '../lib/convert'
import type { GameAnalysis, RefinedEval } from '../lib/engine/analysis'
import type { Score } from '../lib/engine/uci'
import type { EngineSettings, ExplorerSettings } from '../lib/settings'
import type { ChartRow } from '../lib/gameModel'
import { capturedMaterial, clockAtPly } from '../lib/gameModel'
import type { MoveTree } from '../lib/moveTree'
import type { Opening } from '../lib/openings'
import type { ConvertOptions } from '../lib/convert'
import type { PgnExtras } from './PgnExtrasSwitches'
import AnalysisTabs from './AnalysisTabs'
import BoardBoundary from './BoardBoundary'
import BoardMenu from './BoardMenu'
import BoardViewer, { BoardNav, PlayerPlateRow } from './BoardViewer'
import type { EvalLabel, OverlayArrow, PlayerPlate } from './BoardViewer'
import EnginePanel from './EnginePanel'
import type { EngineArrow } from './EnginePanel'
import type { MaiaMove } from '../lib/maia/decode'
import EvalBar from './EvalBar'
import FileWarnings from './FileWarnings'
import GameTabs from './GameTabs'
import ReviewError from './ReviewError'

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
  /** Play a move by SAN — what the opening explorer's rows are. */
  onPlaySan: (san: string) => boolean
  onPromote: (nodeId: string, toMainline: boolean) => void
  onDemote: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  /** Step forward, which asks which way when the position has a choice. */
  onStepForward: () => void
  branch: { atId: string; index: number } | null
  onBranchIndexChange: (index: number) => void
  onBranchChoose: (nodeId: string) => void
  onBranchClose: () => void
  /** What the file could not be read as written; empty once dismissed. */
  warnings: string[]
  onDismissWarnings: () => void
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
  explorerSettings: ExplorerSettings
  onExplorerSettingsChange: (next: ExplorerSettings) => void
  onTopScore: (score: Score | null, depth: number) => void
  onEngineMoves: (lines: EngineArrow[]) => void
  /** Maia's moves for this position, likeliest first, for the violet arrows. */
  onMaiaMoves: (moves: MaiaMove[] | null) => void
  onCommentChange: (nodeId: string, comment: string) => void
  arrows: Arrow[]
  /** Maia's move and the played move, drawn thinner and over the engine's. */
  overlayArrows: OverlayArrow[]
  /** Scores printed at the arrow heads; empty when the setting is off. */
  evalLabels: EvalLabel[]
  /** Piece set id from the appearance settings. */
  pieceSet: string

  /* Everything below belongs to the pane beside the board — the PGN behind the
     game, which used to be a page of its own reached through a step bar. */
  headers: Array<{ name: string; value: string }>
  onHeaderChange: (index: number, value: string) => void
  onHeaderAdd: (name: string) => void
  onHeaderRemove: (index: number) => void
  generatedHeaders: Array<{ name: string; value: string }>
  sourceText: string
  onSourceTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  onConvert: (text: string, options: ConvertOptions) => void
  convertError: string | null
  convertedPgn: string | null
  downloadName: string
  extras: PgnExtras
  onExtraChange: (id: keyof PgnExtras, on: boolean) => void
  /** The chapter this game came from on Lichess, when it came from one. */
  lichessUrl: string | null
  /** The game's own labels, and every label already in use. */
  gameTags: string[]
  onGameTagsChange: (tags: string[]) => void
  knownTags: string[]
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
  onPlaySan,
  onPromote,
  onDemote,
  onDelete,
  onStepForward,
  branch,
  onBranchIndexChange,
  onBranchChoose,
  onBranchClose,
  warnings,
  onDismissWarnings,
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
  explorerSettings,
  onExplorerSettingsChange,
  onTopScore,
  onEngineMoves,
  onMaiaMoves,
  onCommentChange,
  arrows,
  overlayArrows,
  evalLabels,
  pieceSet,
  headers,
  onHeaderChange,
  onHeaderAdd,
  onHeaderRemove,
  generatedHeaders,
  sourceText,
  onSourceTextChange,
  sourceFileName,
  onSourceFileNameChange,
  onConvert,
  convertError,
  convertedPgn,
  downloadName,
  extras,
  onExtraChange,
  lichessUrl,
  gameTags,
  onGameTagsChange,
  knownTags,
}: AnalysisPageProps) {
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  // Lives here rather than in App because this is where the two ends meet: the
  // explorer that reports the hover and the board that draws it are siblings.
  const [hintMove, setHintMove] = useState<{ from: string; to: string } | null>(null)
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
  // What Maia's rating follows by default: how the player who has to move here
  // has actually been playing. It changes with the side to move, which is the
  // point — the two players in a game are rarely the same strength.
  const playedLike =
    analysis && (shownFen.split(' ')[1] === 'b' ? analysis.black : analysis.white).playedLike
  const lead = Math.abs(captured.diff)
  const whitePlate: PlayerPlate = {
    name: whiteName,
    elo: whiteElo,
    clock: clockAtPly(moves, ply, 'w', startSeconds),
    captured: captured.black,
    lead: captured.diff > 0 ? `+${lead}` : null,
  }
  const blackPlate: PlayerPlate = {
    name: blackName,
    elo: blackElo,
    clock: clockAtPly(moves, ply, 'b', startSeconds),
    captured: captured.white,
    lead: captured.diff < 0 ? `+${lead}` : null,
  }
  const topPlate = orientation === 'white' ? blackPlate : whitePlate
  const bottomPlate = orientation === 'white' ? whitePlate : blackPlate
  const topColor = orientation === 'white' ? 'b' : 'w'
  const bottomColor = orientation === 'white' ? 'w' : 'b'

  // A game with no moves has nothing to review, so the ring would sit there
  // spinning over a search that never will start. A failed review is finished
  // too — the banner says so instead.
  const reviewing = moves.length > 0 && !analysis && !analysisError

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ReviewError error={analysisError} />

      <FileWarnings warnings={warnings} onDismiss={onDismissWarnings} />

      {/* Shape lives in .analysis-grid in index.css so it can change at lg. */}
      <div className="analysis-grid min-h-0 lg:flex-1">
        <div className="area-plate-top min-w-0">
          <PlayerPlateRow plate={topPlate} color={topColor} />
        </div>

        <div className="area-eval-bar flex">
          <EvalBar score={evalScore} orientation={orientation} />
        </div>

        <div className="area-board">
          <BoardBoundary resetKey={currentId}>
            <BoardViewer
              tree={tree}
              currentId={currentId}
              orientation={orientation}
              analysis={analysis}
              arrows={arrows}
              overlayArrows={overlayArrows}
              hintArrow={hintMove}
              evalLabels={evalLabels}
              onPieceMove={onPieceMove}
              pieceSet={pieceSet}
            />
          </BoardBoundary>
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
            reviewActive={reviewing}
            reviewProgress={analysisProgress}
            pieceSet={pieceSet}
            orientation={orientation}
            onTopScore={onTopScore}
            onFirstMoves={onEngineMoves}
            onMaiaMoves={onMaiaMoves}
            playedLike={playedLike}
          />
          <GameTabs
            tree={tree}
            currentId={currentId}
            onNavigate={onNavigate}
            analysis={analysis}
            deeperEvals={deeperEvals}
            onPromote={onPromote}
            onDemote={onDemote}
            onDelete={onDelete}
            branch={branch}
            onBranchIndexChange={onBranchIndexChange}
            onBranchChoose={onBranchChoose}
            onBranchClose={onBranchClose}
            headers={headers}
            onHeaderChange={onHeaderChange}
            onHeaderAdd={onHeaderAdd}
            onHeaderRemove={onHeaderRemove}
            generatedHeaders={generatedHeaders}
            opening={opening}
            sourceText={sourceText}
            onSourceTextChange={onSourceTextChange}
            sourceFileName={sourceFileName}
            onSourceFileNameChange={onSourceFileNameChange}
            onConvert={onConvert}
            convertError={convertError}
            convertedPgn={convertedPgn}
            downloadName={downloadName}
            extras={extras}
            onExtraChange={onExtraChange}
            hasEvals={analysis != null}
            lichessUrl={lichessUrl}
            gameTags={gameTags}
            onGameTagsChange={onGameTagsChange}
            knownTags={knownTags}
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
            onStepForward={onStepForward}
            onRotate={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            orientation={orientation}
            menu={(className) => (
              <BoardMenu
                value={engineSettings}
                onChange={onEngineSettingsChange}
                className={className}
              />
            )}
          />
        </div>

        {/* Charts, spanning the full width so the edges line up */}
        <div className="area-tabs min-h-0">
          <AnalysisTabs
            fen={shownFen}
            onPlayMove={onPlaySan}
            onHoverMove={setHintMove}
            explorerSettings={explorerSettings}
            onExplorerSettingsChange={onExplorerSettingsChange}
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
