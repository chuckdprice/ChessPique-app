import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import AnalysisPage from './components/AnalysisPage'
import AppearanceMenu from './components/AppearanceSettings'
import PgnInput from './components/PgnInput'
import StepNav from './components/StepNav'
import type { Page } from './components/StepNav'
import TagEditor from './components/TagEditor'
import { buildPgn, convertPgn } from './lib/convert'
import type { ConvertOptions, ConvertResult } from './lib/convert'
import { analyzeGame, PLAYED_LIKE_MAE } from './lib/engine/analysis'
import type { GameAnalysis } from './lib/engine/analysis'
import type { Score } from './lib/engine/uci'
import { buildChartRows, replayGame } from './lib/gameModel'
import type { ReplayedGame } from './lib/gameModel'
import {
  applyAppearance,
  loadAppearance,
  loadEngineSettings,
  saveAppearance,
  watchSystemTheme,
} from './lib/settings'
import type { AppearanceSettings, EngineSettings } from './lib/settings'

interface LoadedGame {
  result: ConvertResult
  replay: ReplayedGame
}

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((h) => h.name === name)?.value
}

/** Engine lines fade from best to worst; the played move gets its own colour. */
const ENGINE_ARROW_ALPHA = [0.85, 0.62, 0.45, 0.34, 0.26]
const PLAYED_MOVE_ARROW = 'rgba(237, 173, 47, 1)'

export default function App() {
  const [game, setGame] = useState<LoadedGame | null>(null)
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  const [ply, setPly] = useState(0)
  const [page, setPage] = useState<Page>('upload')
  // Source PGN lives here, not in PgnInput, so switching pages does not lose it.
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance)
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(loadEngineSettings)
  const [engineOn, setEngineOn] = useState(false)
  const [liveScore, setLiveScore] = useState<Score | null>(null)
  const [engineMoves, setEngineMoves] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const analysisSignal = useRef<{ cancelled: boolean } | null>(null)

  const appearanceRef = useRef(appearance)
  appearanceRef.current = appearance
  useEffect(() => {
    applyAppearance(appearance)
    saveAppearance(appearance)
  }, [appearance])
  useEffect(() => watchSystemTheme(() => appearanceRef.current), [])

  const handleConvert = (text: string, options: ConvertOptions) => {
    try {
      const result = convertPgn(text, options)
      const replay = replayGame(result.moves)
      // Clear stale analysis in the same render batch as the new game, so no
      // render ever pairs the old analysis with the new move list.
      if (analysisSignal.current) analysisSignal.current.cancelled = true
      setAnalysis(null)
      setAnalysisProgress(null)
      setAnalysisError(null)
      setLiveScore(null)
      setEngineMoves([])
      setGame({ result, replay })
      setHeaders(result.headers)
      setPly(0)
      setError(null)
      setPage('analysis')
    } catch (e) {
      setGame(null)
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setPage('upload')
      if (message.includes('starting clock')) setOverridesOpen(true)
    }
  }

  // Full-game Stockfish analysis: kicks off automatically for each new game.
  useEffect(() => {
    if (analysisSignal.current) analysisSignal.current.cancelled = true
    setAnalysis(null)
    setAnalysisProgress(null)
    setAnalysisError(null)
    setLiveScore(null)
    if (!game) return

    const signal = { cancelled: false }
    analysisSignal.current = signal
    analyzeGame(game.replay.fens, game.result.moves, game.replay.ucis, {
      signal,
      onProgress: (done, total) => {
        if (!signal.cancelled) setAnalysisProgress({ done, total })
      },
    })
      .then((result) => {
        if (!signal.cancelled && result) setAnalysis(result)
      })
      .catch((e) => {
        if (!signal.cancelled) {
          setAnalysisError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!signal.cancelled) setAnalysisProgress(null)
      })

    return () => {
      signal.cancelled = true
    }
  }, [game])

  const handleTopScore = useCallback((score: Score | null) => setLiveScore(score), [])
  const handleEngineMoves = useCallback((ucis: string[]) => setEngineMoves(ucis), [])

  // Arrow-key navigation on the analysis page, except while typing in a field.
  useEffect(() => {
    if (!game || page !== 'analysis') return
    const lastPly = game.replay.fens.length - 1
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPly((p) => Math.max(0, p - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPly((p) => Math.min(lastPly, p + 1))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setPly(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setPly(lastPly)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [game, page])

  const chartRows = useMemo(() => (game ? buildChartRows(game.result.moves) : []), [game])

  const convertedPgn = useMemo(
    () => (game ? buildPgn(headers, game.result.moves, game.result.result) : null),
    [game, headers],
  )

  const downloadName = useMemo(() => {
    const white = findHeader(headers, 'White') ?? 'White'
    const black = findHeader(headers, 'Black') ?? 'Black'
    const date = findHeader(headers, 'Date') ?? ''
    const stem = `${white} vs ${black}${date ? ` ${date.replaceAll('.', '-')}` : ''}`
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
    return `${stem || 'converted'}.pgn`
  }, [headers])

  const whiteName = (game && findHeader(headers, 'White')) || 'White'
  const blackName = (game && findHeader(headers, 'Black')) || 'Black'

  // "(Elo / ~played-like Lichess Rapid)"; played-like fills in after analysis.
  const ratingLabel = (elo: string | undefined, playedLike: number | undefined) => {
    const playedLikeText =
      playedLike != null ? `~${playedLike} Lichess Rapid` : analysisProgress ? '…' : null
    if (!elo && playedLikeText == null) return null
    return `(${elo ?? '—'} / ${playedLikeText ?? '—'})`
  }
  const whiteRating = game
    ? ratingLabel(findHeader(headers, 'WhiteElo'), analysis?.white.playedLike)
    : null
  const blackRating = game
    ? ratingLabel(findHeader(headers, 'BlackElo'), analysis?.black.playedLike)
    : null

  const evalScore: Score | null = analysis ? (analysis.evals[ply] ?? null) : liveScore
  // Always reserve the bar's column so the board does not shift sideways when
  // the review finishes; it simply sits neutral until there is a score.
  const showEvalBar = !!game

  // Engine suggestions fade best→worst; the move actually played is drawn last
  // in a brighter colour so it stands out against them.
  const arrows: Arrow[] = useMemo(() => {
    if (!engineOn || !game) return []
    const engineArrows: Arrow[] = engineMoves
      .slice(0, ENGINE_ARROW_ALPHA.length)
      .map((uci, i) => ({
        startSquare: uci.slice(0, 2),
        endSquare: uci.slice(2, 4),
        color: `rgba(44, 129, 97, ${ENGINE_ARROW_ALPHA[i]})`,
      }))
    const played = game.replay.lastMoveSquares[ply]
    if (played) {
      engineArrows.push({
        startSquare: played[0],
        endSquare: played[1],
        color: PLAYED_MOVE_ARROW,
      })
    }
    return engineArrows
  }, [engineOn, engineMoves, game, ply])

  const analysisPercent =
    analysisProgress && analysisProgress.total > 0
      ? Math.round((analysisProgress.done / analysisProgress.total) * 100)
      : null

  const ratingTooltip =
    `Rating from the PGN tag / estimated "played like" rating for this game.\n\n` +
    `Estimated from average win-% lost per move in undecided positions, calibrated against ` +
    `rated Lichess rapid games, so it sits on the Lichess rapid scale — which runs higher ` +
    `than USCF or FIDE OTB ratings.\n\n` +
    `One game is a weak signal: typical error is around ±${PLAYED_LIKE_MAE} points, ` +
    `so treat it as a rough indicator rather than a measurement.`

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-felt text-buff">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <span aria-hidden="true" className="text-3xl leading-none">
            ♞
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              ChessNoteR PGN Converter
            </h1>
            <p className="text-[11px] leading-tight text-buff/70">
              Copyright (c) 2026, Chuck Price
            </p>
          </div>
          <span
            className="shrink-0 rounded-full bg-buff/15 px-2.5 py-1 font-score text-xs"
            title="Application version"
          >
            v{__APP_VERSION__}
          </span>
          <AppearanceMenu value={appearance} onChange={setAppearance} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] shrink-0 px-4 pt-2 sm:px-6">
        <StepNav
          page={page}
          onPageChange={setPage}
          gameLoaded={!!game}
          analysisPercent={analysisPercent}
        />
      </div>

      <main
        className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-4 py-2 sm:px-6"
        style={
          {
            // Board fills the height left over by header, steps, plates, nav
            // and charts, so the analysis page fits without scrolling.
            '--board-size': 'clamp(280px, calc(100dvh - 470px), 560px)',
          } as React.CSSProperties
        }
      >
        {page === 'upload' && (
          <PgnInput
            onConvert={handleConvert}
            error={error}
            text={sourceText}
            onTextChange={setSourceText}
            sourceFileName={sourceFileName}
            onSourceFileNameChange={setSourceFileName}
            convertedPgn={convertedPgn}
            downloadName={downloadName}
            overridesOpen={overridesOpen}
            onOverridesOpenChange={setOverridesOpen}
          />
        )}

        {page === 'tags' && game && convertedPgn && (
          <TagEditor
            headers={headers}
            onChange={(index, value) =>
              setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, value } : h)))
            }
            pgn={convertedPgn}
            downloadName={downloadName}
          />
        )}

        {page === 'analysis' && game && (
          <AnalysisPage
            result={game.result}
            replay={game.replay}
            moves={game.result.moves}
            ply={ply}
            onPlyChange={setPly}
            analysis={analysis}
            analysisProgress={analysisProgress}
            analysisError={analysisError}
            chartRows={chartRows}
            whiteName={whiteName}
            blackName={blackName}
            whiteRating={whiteRating}
            blackRating={blackRating}
            ratingTooltip={ratingTooltip}
            evalScore={evalScore}
            showEvalBar={showEvalBar}
            engineOn={engineOn}
            onEngineOnChange={setEngineOn}
            engineSettings={engineSettings}
            onEngineSettingsChange={setEngineSettings}
            onTopScore={handleTopScore}
            onEngineMoves={handleEngineMoves}
            arrows={arrows}
          />
        )}
      </main>
    </div>
  )
}
