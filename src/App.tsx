import { useEffect, useMemo, useRef, useState } from 'react'
import BoardViewer from './components/BoardViewer'
import ClockChart from './components/ClockChart'
import MoveTable from './components/MoveTable'
import PgnInput from './components/PgnInput'
import TagEditor from './components/TagEditor'
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
  const [overridesOpen, setOverridesOpen] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  const handleConvert = (text: string, options: ConvertOptions) => {
    try {
      const result = convertPgn(text, options)
      const replay = replayGame(result.moves)
      setGame({ result, replay })
      setHeaders(result.headers)
      setPly(0)
      setError(null)
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

  return (
    <div className="min-h-screen">
      <header className="bg-felt text-buff">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-6 sm:px-6">
          <span aria-hidden="true" className="text-4xl leading-none">
            ♞
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              ChessNoteR PGN Converter
            </h1>
            <p className="mt-0.5 text-sm text-buff/80">
              Turn ChessNoteR %emt timing into standard %clk comments that Lichess and
              Chess.com understand.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <PgnInput
          onConvert={handleConvert}
          error={error}
          overridesOpen={overridesOpen}
          onOverridesOpenChange={setOverridesOpen}
        />

        {game && (
          <div ref={resultsRef} className="scroll-mt-6 space-y-8">
            {game.result.warnings.length > 0 && (
              <div
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
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
              />
              <MoveTable
                moves={game.result.moves}
                result={game.result.result}
                ply={ply}
                onPlyChange={setPly}
              />
            </div>

            <ClockChart
              rows={chartRows}
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
