import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AnalysisProgress from './components/AnalysisProgress'
import AnalysisTabs from './components/AnalysisTabs'
import AppearanceMenu from './components/AppearanceSettings'
import BoardViewer from './components/BoardViewer'
import EnginePanel from './components/EnginePanel'
import MoveTable from './components/MoveTable'
import PgnInput from './components/PgnInput'
import TagEditor from './components/TagEditor'
import { analyzeGame, PLAYED_LIKE_MAE } from './lib/engine/analysis'
import type { GameAnalysis } from './lib/engine/analysis'
import type { Score } from './lib/engine/uci'
import {
  applyAppearance,
  loadAppearance,
  loadEngineSettings,
  saveAppearance,
  watchSystemTheme,
} from './lib/settings'
import type { AppearanceSettings, EngineSettings } from './lib/settings'
import { buildPgn, convertPgn } from './lib/convert'
import type { ConvertOptions, ConvertResult } from './lib/convert'
import { buildChartRows, replayGame } from './lib/gameModel'
import type { ReplayedGame } from './lib/gameModel'

interface LoadedGame {
  result: ConvertResult
  replay: ReplayedGame
}

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((h) => h.name === name)?.value
}

export default function App() {
  const [game, setGame] = useState<LoadedGame | null>(null)
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  const [ply, setPly] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [inputOpen, setInputOpen] = useState(true)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance)
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(loadEngineSettings)
  const [engineOn, setEngineOn] = useState(false)
  const [liveScore, setLiveScore] = useState<Score | null>(null)
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<{ done: number; total: number } | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const analysisSignal = useRef<{ cancelled: boolean } | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

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
      setGame({ result, replay })
      setHeaders(result.headers)
      setPly(0)
      setError(null)
      setInputOpen(false)
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (e) {
      setGame(null)
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
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

  // Arrow-key navigation, except while typing in a field.
  useEffect(() => {
    if (!game) return
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
  }, [game])

  const chartRows = useMemo(
    () => (game ? buildChartRows(game.result.moves) : []),
    [game],
  )

  const download = () => {
    if (!game) return
    const pgn = buildPgn(headers, game.result.moves, game.result.result)
    const white = findHeader(headers, 'White') ?? 'White'
    const black = findHeader(headers, 'Black') ?? 'Black'
    const date = findHeader(headers, 'Date') ?? ''
    const stem = `${white} vs ${black}${date ? ` ${date.replaceAll('.', '-')}` : ''}`
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${stem || 'converted'}.pgn`
    a.click()
    URL.revokeObjectURL(url)
  }

  const whiteName = (game && findHeader(headers, 'White')) || 'White'
  const blackName = (game && findHeader(headers, 'Black')) || 'Black'

  // "(Elo / ~played-like)" plate suffix; played-like fills in after analysis.
  const ratingLabel = (elo: string | undefined, playedLike: number | undefined) => {
    const playedLikeText = playedLike != null ? `~${playedLike}` : analysisProgress ? '…' : null
    if (!elo && playedLikeText == null) return null
    return `(${elo ?? '—'} / ${playedLikeText ?? '—'})`
  }
  const ratingTooltip =
    `Rating from the PGN tag / estimated "played like" rating for this game.\n\n` +
    `Estimated from average capped centipawn loss, calibrated against rated Lichess ` +
    `rapid games, so it sits on the Lichess rapid scale — which runs higher than USCF ` +
    `or FIDE OTB ratings.\n\n` +
    `One game is a weak signal: typical error is around ±${PLAYED_LIKE_MAE} points, ` +
    `so treat it as a rough indicator rather than a measurement.`
  const whiteRating = game
    ? ratingLabel(findHeader(headers, 'WhiteElo'), analysis?.white.playedLike)
    : null
  const blackRating = game
    ? ratingLabel(findHeader(headers, 'BlackElo'), analysis?.black.playedLike)
    : null

  const currentFen = game ? game.replay.fens[ply] : null
  const evalScore: Score | null = analysis ? (analysis.evals[ply] ?? null) : liveScore
  const showEvalBar = !!game && (analysis != null || engineOn)

  return (
    <div className="min-h-screen">
      <header className="bg-felt text-buff">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-6 sm:px-6">
          <span aria-hidden="true" className="text-4xl leading-none">
            ♞
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              ChessNoteR PGN Converter
            </h1>
            <p className="mt-0.5 text-sm text-buff/80">
              Turn ChessNoteR %emt timing into standard %clk comments that Lichess and
              Chess.com understand.
            </p>
          </div>
          <AppearanceMenu value={appearance} onChange={setAppearance} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <PgnInput
          onConvert={handleConvert}
          error={error}
          open={inputOpen}
          onOpenChange={setInputOpen}
          overridesOpen={overridesOpen}
          onOverridesOpenChange={setOverridesOpen}
        />

        {game && (
          <div ref={resultsRef} className="scroll-mt-6 space-y-8">
            {game.result.warnings.length > 0 && (
              <div
                role="status"
                className="rounded-xl border border-warn-text/25 bg-warn-bg px-5 py-4 text-sm text-warn-text"
              >
                <p className="font-medium">
                  Some moves were missing timing data — their clocks were carried forward:
                </p>
                <ul className="mt-1 list-inside list-disc">
                  {game.result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-xl font-semibold">
                {whiteName} vs {blackName}
              </h2>
              <button
                type="button"
                onClick={download}
                className="rounded-lg bg-felt px-5 py-2.5 font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep"
              >
                Download converted PGN
              </button>
            </div>

            {(!analysis || analysisError) && (
              <AnalysisProgress progress={analysisProgress} error={analysisError} />
            )}

            <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_15rem]">
              <TagEditor
                headers={headers}
                onChange={(index, value) =>
                  setHeaders((prev) =>
                    prev.map((h, i) => (i === index ? { ...h, value } : h)),
                  )
                }
              />
              <BoardViewer
                replay={game.replay}
                moves={game.result.moves}
                ply={ply}
                onPlyChange={setPly}
                whiteName={whiteName}
                blackName={blackName}
                whiteRating={whiteRating}
                blackRating={blackRating}
                ratingTooltip={ratingTooltip}
                analysis={analysis}
                evalScore={evalScore}
                showEvalBar={showEvalBar}
              />
              <div className="flex min-h-0 flex-col gap-4">
                {currentFen && (
                  <EnginePanel
                    fen={currentFen}
                    enabled={engineOn}
                    onEnabledChange={setEngineOn}
                    settings={engineSettings}
                    onSettingsChange={setEngineSettings}
                    onTopScore={handleTopScore}
                  />
                )}
                <MoveTable
                  moves={game.result.moves}
                  result={game.result.result}
                  ply={ply}
                  onPlyChange={setPly}
                  analysis={analysis}
                />
              </div>
            </div>

            <AnalysisTabs
              analysis={analysis}
              progress={analysisProgress}
              analysisError={analysisError}
              moves={game.result.moves}
              ply={ply}
              onPlyChange={setPly}
              chartRows={chartRows}
              startSeconds={game.result.timeControl.startSeconds}
              whiteName={whiteName}
              blackName={blackName}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-rule py-6 text-center text-xs text-ink-mute">
        Conversion runs entirely in your browser — your games never leave this page.
      </footer>
    </div>
  )
}
