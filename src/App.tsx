import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import AppMenu from './components/AppMenu'
import BrandMark from './components/BrandMark'
import HelpDialog from './components/HelpDialog'
import PgnFilePage from './components/PgnFilePage'
import StepNav from './components/StepNav'
import type { Page } from './components/StepNav'
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

// The analysis page owns every heavy dependency in the app — recharts for the
// eval and clock charts, react-chessboard for the board — and none of it is
// reachable from the upload page. Loading it on demand keeps those out of the
// first download; the effect below warms the chunk so the page is already in
// memory by the time a conversion finishes.
const loadAnalysisPage = () => import('./components/AnalysisPage')
const AnalysisPage = lazy(loadAnalysisPage)

interface LoadedGame {
  result: ConvertResult
  replay: ReplayedGame
}

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((h) => h.name === name)?.value
}

/**
 * Arrow colours. Blue for the engine's candidate moves (it reads clearly on
 * both the cream and green squares, which the old green did not) fading from
 * best to worst, and warm orange for the move actually played next — the two
 * are directly comparable because both belong to the side to move.
 */
const ENGINE_ARROW_ALPHA = [0.95, 0.7, 0.52, 0.4, 0.3]
const ENGINE_ARROW_RGB = '38, 122, 255'
const NEXT_MOVE_ARROW = 'rgba(244, 130, 32, 0.95)'

export default function App() {
  const [game, setGame] = useState<LoadedGame | null>(null)
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  const [ply, setPly] = useState(0)
  const [page, setPage] = useState<Page>('pgn')
  // Source PGN lives here, not in PgnFilePage, so switching pages does not lose it.
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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

  // Fetch the analysis chunk once the browser is idle, while the user is still
  // pasting or picking a PGN, so Convert never waits on a network round trip.
  useEffect(() => {
    const warm = () => void loadAnalysisPage()
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(warm)
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 1000)
    return () => clearTimeout(id)
  }, [])

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
      // The tags belonged to the game that just went away, and the tag pane is
      // now always on screen — left alone they would sit there looking editable
      // while feeding a converted PGN that no longer exists.
      setHeaders([])
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setPage('pgn')
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

  const handleHeaderChange = useCallback((index: number, value: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, value } : h)))
  }, [])

  const handleTopScore = useCallback((score: Score | null) => setLiveScore(score), [])
  const handleEngineMoves = useCallback((ucis: string[]) => setEngineMoves(ucis), [])

  // Arrow-key navigation on the analysis page, except while typing in a field.
  useEffect(() => {
    if (!game || page !== 'analysis' || helpOpen) return
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
  }, [game, page, helpOpen])

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

  const whiteElo = (game && findHeader(headers, 'WhiteElo')) || null
  const blackElo = (game && findHeader(headers, 'BlackElo')) || null

  const evalScore: Score | null = analysis ? (analysis.evals[ply] ?? null) : liveScore

  // Engine candidates fade best→worst, then the game's own next move is drawn
  // on top. The move already on the board gets no arrow — the highlighted
  // squares already show it, and it belongs to the other side.
  const arrows: Arrow[] = useMemo(() => {
    if (!engineOn || !game) return []
    // lastMoveSquares[ply + 1] is the move played *from* this position, so it
    // is by the same side the engine is thinking for. Only that one.
    const nextMove = game.replay.lastMoveSquares[ply + 1]
    const nextKey = nextMove ? `${nextMove[0]}${nextMove[1]}` : null

    // The board keys arrows by from-to, so every square pair may appear once.
    // Mid-search the engine can list the same first move under two multipv
    // slots, and the played move often *is* the engine's pick — in both cases
    // the duplicate is dropped and the orange next-move arrow wins.
    const seen = new Set<string>()
    if (nextKey) seen.add(nextKey)

    const list: Arrow[] = []
    engineMoves.slice(0, ENGINE_ARROW_ALPHA.length).forEach((uci, i) => {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const key = `${from}${to}`
      if (seen.has(key)) return
      seen.add(key)
      list.push({
        startSquare: from,
        endSquare: to,
        color: `rgba(${ENGINE_ARROW_RGB}, ${ENGINE_ARROW_ALPHA[i]})`,
      })
    })

    if (nextMove) {
      list.push({
        startSquare: nextMove[0],
        endSquare: nextMove[1],
        color: NEXT_MOVE_ARROW,
      })
    }
    return list
  }, [engineOn, engineMoves, game, ply])

  const analysisPercent =
    analysisProgress && analysisProgress.total > 0
      ? Math.round((analysisProgress.done / analysisProgress.total) * 100)
      : null

  const accuracyTooltip =
    `Overall accuracy for the game: the average of each move's accuracy, which comes from the ` +
    `win-% that move gave up (lichess formula). 100% means every move held the position's value.`

  const playedLikeTooltip =
    `Estimated "played like" rating for this game.\n\n` +
    `Estimated from average win-% lost per move in undecided positions, calibrated against ` +
    `rated Lichess rapid games, so it sits on the Lichess rapid scale — which runs higher ` +
    `than USCF or FIDE OTB ratings.\n\n` +
    `One game is a weak signal: typical error is around ±${PLAYED_LIKE_MAE} points, ` +
    `so treat it as a rough indicator rather than a measurement.`

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="shrink-0 bg-felt text-buff">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <BrandMark />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              ChessNoteR Game Analysis
            </h1>
            <p className="text-[11px] leading-tight text-buff/70">
              Copyright (c) 2026, Chuck Price
            </p>
          </div>
          <AppMenu
            value={appearance}
            onChange={setAppearance}
            onOpenHelp={() => setHelpOpen(true)}
          />
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
        {page === 'pgn' && (
          <PgnFilePage
            onConvert={handleConvert}
            error={error}
            text={sourceText}
            onTextChange={setSourceText}
            sourceFileName={sourceFileName}
            onSourceFileNameChange={setSourceFileName}
            convertedPgn={convertedPgn}
            downloadName={downloadName}
            headers={headers}
            onHeaderChange={handleHeaderChange}
            overridesOpen={overridesOpen}
            onOverridesOpenChange={setOverridesOpen}
          />
        )}

        {page === 'analysis' && game && (
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="flex flex-1 items-center justify-center text-sm text-ink-mute"
              >
                Loading the analysis board…
              </div>
            }
          >
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
              whiteElo={whiteElo}
              blackElo={blackElo}
              accuracyTooltip={accuracyTooltip}
              playedLikeTooltip={playedLikeTooltip}
              evalScore={evalScore}
              engineOn={engineOn}
              onEngineOnChange={setEngineOn}
              engineSettings={engineSettings}
              onEngineSettingsChange={setEngineSettings}
              onTopScore={handleTopScore}
              onEngineMoves={handleEngineMoves}
              arrows={arrows}
            />
          </Suspense>
        )}
      </main>

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
