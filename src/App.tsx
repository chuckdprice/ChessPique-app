import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import AppearanceMenu from './components/AppearanceMenu'
import BrandMark from './components/BrandMark'
import HelpDialog from './components/HelpDialog'
import PgnFilePage from './components/PgnFilePage'
import type { PgnPanes } from './components/PgnFilePage'
import StepNav from './components/StepNav'
import type { Page } from './components/StepNav'
import type { PgnExtras } from './components/PgnExtrasSwitches'
import { buildPgn, convertPgn, withExtraTags } from './lib/convert'
import type { ConvertOptions, ConvertResult } from './lib/convert'
import { findOpening } from './lib/openings'
import type { Opening } from './lib/openings'
import {
  analyzeGame,
  moveNote,
  moveVariation,
  PLAYED_LIKE_MAE,
  REVIEW_DEPTH,
  withDeeperEval,
} from './lib/engine/analysis'
import type { GameAnalysis, RefinedEval } from './lib/engine/analysis'
import { formatEvalTag } from './lib/engine/uci'
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

/** Credited in every converted PGN, so a shared file says where it came from. */
const ANNOTATOR_URL = 'https://chessnoter.vercel.app/'

/** The game's opening, once the book has loaded; null until then and if unnamed. */
function useOpening(fens: string[] | null): Opening | null {
  const [opening, setOpening] = useState<Opening | null>(null)

  useEffect(() => {
    setOpening(null)
    if (!fens) return
    let current = true
    findOpening(fens).then((found) => {
      if (current) setOpening(found)
    })
    return () => {
      current = false
    }
  }, [fens])

  return opening
}

export default function App() {
  const [game, setGame] = useState<LoadedGame | null>(null)
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  const [ply, setPly] = useState(0)
  const [page, setPage] = useState<Page>('pgn')
  // Source PGN lives here, not in PgnFilePage, so switching pages does not lose it.
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Which steps of the PGN File page are open. Held here, not in the page, so
  // it survives a trip to the analysis page and back.
  const [panes, setPanes] = useState<PgnPanes>({
    original: true,
    headers: false,
    converted: false,
    export: false,
  })
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
  // Positions the live engine has out-searched the review on, keyed by ply.
  const [deeperEvals, setDeeperEvals] = useState<Map<number, RefinedEval>>(new Map())
  // What the converted PGN carries beyond the moves and clocks. On by default:
  // the switches are there to leave things out, and a file is more useful with
  // them in.
  const [pgnExtras, setPgnExtras] = useState<PgnExtras>({
    evals: true,
    comments: true,
    variations: true,
  })
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
      // The steps below the first are now worth opening, and the output is
      // what the user came for; coming back to this page should show it.
      setPanes((prev) => ({ ...prev, converted: true }))
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
      // Whatever went wrong, it went wrong with the text in the first step.
      setPanes((prev) => ({ ...prev, original: true }))
    }
  }

  // Full-game Stockfish analysis: kicks off automatically for each new game.
  useEffect(() => {
    if (analysisSignal.current) analysisSignal.current.cancelled = true
    setAnalysis(null)
    setAnalysisProgress(null)
    setAnalysisError(null)
    setLiveScore(null)
    setDeeperEvals(new Map())
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

  // The engine reports against whatever position it is on, which is always the
  // current one; read through refs so the handler itself never changes and the
  // panel's search is not restarted by a new callback identity.
  const plyRef = useRef(ply)
  plyRef.current = ply
  const analysisRef = useRef(analysis)
  analysisRef.current = analysis

  const handleTopScore = useCallback((score: Score | null, depth: number) => {
    setLiveScore(score)
    if (!score) return
    const at = plyRef.current
    // Terminal positions carry Infinity and are never beaten; a position the
    // review has not reached yet is assumed to have had its full depth, which
    // is the conservative guess.
    const reviewDepth = analysisRef.current?.evalDepths[at] ?? REVIEW_DEPTH
    setDeeperEvals((prev) => withDeeperEval(prev, at, { score, depth }, reviewDepth))
  }, [])
  const handleEngineMoves = useCallback((ucis: string[]) => setEngineMoves(ucis), [])

  const handlePaneChange = useCallback(
    (id: keyof PgnPanes, open: boolean) => setPanes((prev) => ({ ...prev, [id]: open })),
    [],
  )

  const handleExtraChange = useCallback(
    (id: keyof PgnExtras, on: boolean) => setPgnExtras((prev) => ({ ...prev, [id]: on })),
    [],
  )

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

  const opening = useOpening(game?.replay.fens ?? null)

  const convertedPgn = useMemo(() => {
    if (!game) return null

    // The tags the app adds itself: the opening whenever the book knows it, and
    // where the file came from.
    const extras = [
      ...(opening
        ? [
            { name: 'ECO', value: opening.eco },
            { name: 'Opening', value: opening.name },
          ]
        : []),
      { name: 'Annotator', value: ANNOTATOR_URL },
    ]

    // evals[i] is the position *after* ply i, so move i takes evals[i + 1] —
    // the evaluation of what it led to, which is where a reader expects it.
    // The live engine's deeper answers are preferred, as in the move list.
    const evals =
      pgnExtras.evals && analysis
        ? game.result.moves.map((_, i) => {
            const score = deeperEvals.get(i + 1)?.score ?? analysis.evals[i + 1]
            return score ? formatEvalTag(score) : null
          })
        : undefined

    // The engine's verdict on a flagged move, and the line it preferred. Both
    // come from the review, so both wait for it.
    const notes =
      pgnExtras.comments && analysis
        ? game.result.moves.map((_, i) => {
            const info = analysis.moves[i]
            return info ? moveNote(info) : null
          })
        : undefined
    const variations =
      pgnExtras.variations && analysis
        ? game.result.moves.map((_, i) => {
            const info = analysis.moves[i]
            return info ? moveVariation(info) || null : null
          })
        : undefined

    return buildPgn(withExtraTags(headers, extras), game.result.moves, game.result.result, {
      evals,
      comments: pgnExtras.comments,
      notes,
      variations,
    })
  }, [game, headers, opening, analysis, deeperEvals, pgnExtras])

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

  // The bar shows the same number as the move list does for this position, so
  // a deepened eval has to reach both or the two would disagree on screen.
  const evalScore: Score | null = analysis
    ? (deeperEvals.get(ply)?.score ?? analysis.evals[ply] ?? null)
    : liveScore

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
    // Phones scroll: the analysis page stacks taller than any handset, and
    // pinning it to the viewport just clipped the parts you could not reach.
    // From lg up the original fixed-height, no-scroll layout is kept.
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="app-header shrink-0 bg-felt text-buff">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <BrandMark />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              {/* Only the device's name links out; "Game Analysis" is this app. */}
              <a
                href="https://chessnoter.com/"
                target="_blank"
                rel="noopener noreferrer"
                title="ChessNoteR — chessnoter.com"
                className="underline-offset-4 hover:underline"
              >
                ChessNoteR
              </a>{' '}
              Game Analysis
            </h1>
            <p className="text-[11px] leading-tight text-buff/70">
              <span className="font-score">v{__APP_VERSION__}</span>
              <span aria-hidden="true" className="mx-1.5 text-buff/40">
                |
              </span>
              (c) 2026{' '}
              {/*
                Underlined at rest rather than only on hover: this is the only
                route for bug reports, so it has to read as a link before anyone
                thinks to hover over it.
              */}
              <a
                href="https://lichess.org/@/DragonBeard"
                target="_blank"
                rel="noopener noreferrer"
                title="Chuck Price on Lichess — message me with bugs or suggestions"
                className="text-buff underline decoration-buff/40 underline-offset-2 transition-colors hover:decoration-buff"
              >
                Chuck Price
              </a>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AppearanceMenu value={appearance} onChange={setAppearance} />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="How to use this app"
              title="Help"
              className="rounded-lg border border-buff/30 p-2 text-buff transition-colors hover:bg-buff/10"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" />
                <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="app-steps mx-auto w-full max-w-[1600px] shrink-0 px-4 pt-2 sm:px-6">
        <StepNav
          page={page}
          onPageChange={setPage}
          gameLoaded={!!game}
          analysisPercent={analysisPercent}
        />
      </div>

      {/* --board-size lives in index.css: a short viewport needs a different
          height budget, and a media query cannot reach an inline style. */}
      <main className="app-main mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-4 py-2 sm:px-6">
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
            extras={pgnExtras}
            onExtraChange={handleExtraChange}
            opening={opening}
            hasEvals={analysis != null}
            panes={panes}
            onPaneChange={handlePaneChange}
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
              deeperEvals={deeperEvals}
              opening={opening}
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
