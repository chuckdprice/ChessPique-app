import { useRef, useState } from 'react'
import type { ConvertOptions } from '../lib/convert'
import type { Opening } from '../lib/openings'
import { loadSession, openSignInWindow, saveSession, signIn } from '../lib/lichess/oauth'
import { fetchAccount } from '../lib/lichess/studies'
import LichessStudyDialog from './LichessStudyDialog'
import Pane from './Pane'
import PgnActions from './PgnActions'
import PgnExtrasSwitches from './PgnExtrasSwitches'
import type { PgnExtras } from './PgnExtrasSwitches'
import TagEditor from './TagEditor'

/** Which step of the page is open; each opens and closes on its own. */
export interface PgnPanes {
  original: boolean
  headers: boolean
  converted: boolean
  export: boolean
}

interface PgnFilePageProps {
  onConvert: (text: string, options: ConvertOptions) => void
  error: string | null
  /** Source PGN lives in App so it survives navigating between pages. */
  text: string
  onTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  /** Converted PGN for the third pane; null before a successful conversion. */
  convertedPgn: string | null
  downloadName: string
  /** PGN tags for the header editor; empty until a game has been converted. */
  headers: Array<{ name: string; value: string }>
  onHeaderChange: (index: number, value: string) => void
  /** What the converted PGN carries beyond moves and clocks. */
  extras: PgnExtras
  onExtraChange: (id: keyof PgnExtras, on: boolean) => void
  opening: Opening | null
  hasEvals: boolean
  /** Open/closed state per pane, held in App so it survives leaving the page. */
  panes: PgnPanes
  onPaneChange: (id: keyof PgnPanes, open: boolean) => void
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'

const PANE_CLASS =
  'w-full h-56 resize-y rounded-lg border border-rule bg-buff-soft/60 px-3 py-2 font-score text-[12px] leading-relaxed placeholder:text-ink-mute/60'

export default function PgnFilePage({
  onConvert,
  error,
  text,
  onTextChange,
  sourceFileName,
  onSourceFileNameChange,
  convertedPgn,
  downloadName,
  headers,
  onHeaderChange,
  extras,
  onExtraChange,
  opening,
  hasEvals,
  panes,
  onPaneChange,
}: PgnFilePageProps) {
  const [dragOver, setDragOver] = useState(false)
  const [studyOpen, setStudyOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  // Distinguishes this sign-in attempt from an abandoned earlier one, so a
  // stale failure cannot pop an error over a fresh attempt.
  const authAttempt = useRef(0)
  const [startMinutes, setStartMinutes] = useState('')
  const [mode, setMode] = useState<OverrideMode>('auto')
  const [amount, setAmount] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Everything after the first step describes a converted game.
  const locked = convertedPgn == null
  const lockedHint = 'convert a PGN first'

  const buildOptions = (): ConvertOptions => {
    const options: ConvertOptions = {}
    const minutes = parseInt(startMinutes, 10)
    if (!Number.isNaN(minutes) && minutes > 0) options.startMinutes = minutes
    const amountSeconds = parseInt(amount, 10)
    if (mode === 'delay') options.delay = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    if (mode === 'increment')
      options.increment = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    return options
  }

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const contents = String(reader.result ?? '')
      onTextChange(contents)
      onSourceFileNameChange(file.name)
      onConvert(contents, buildOptions())
    }
    reader.readAsText(file)
  }

  return (
    <section
      aria-label="PGN file"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2"
    >
      <Pane
        title="Original PGN"
        hint="paste or open the file from your ChessNoteR"
        open={panes.original}
        onOpenChange={(open) => onPaneChange('original', open)}
        aside={sourceFileName ?? undefined}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) loadFile(file)
            }}
            className={`flex-1 rounded-lg border-2 border-dashed px-3 py-2 text-sm transition-colors ${
              dragOver ? 'border-felt-bright bg-buff-soft' : 'border-rule hover:border-felt-bright/60'
            }`}
          >
            <span aria-hidden="true" className="mr-1.5">
              ♞
            </span>
            Upload or drop a .pgn file
          </button>
          <button
            type="button"
            onClick={() => onConvert(text, buildOptions())}
            disabled={text.trim() === ''}
            className="rounded-lg bg-felt px-5 py-2 font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            Convert to %clk
          </button>
        </div>

        {/*
          The time control sits with Convert rather than in a pane of its own:
          it is an argument to that button, needed only when the PGN's own
          TimeControl tag is missing or wrong, and the error that sends you
          here names it.
        */}
        <div className="mb-3 flex flex-wrap items-end gap-4 rounded-lg border border-rule bg-buff-soft/20 px-3 py-2.5">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-mute">Starting time (minutes)</span>
            <input
              type="number"
              min={1}
              value={startMinutes}
              onChange={(e) => setStartMinutes(e.target.value)}
              placeholder="auto"
              className="w-32 rounded-md border border-rule bg-card px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-mute">Delay or increment</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as OverrideMode)}
              className="w-36 rounded-md border border-rule bg-card px-3 py-1.5"
            >
              <option value="auto">Auto-detect</option>
              <option value="none">None</option>
              <option value="delay">Delay</option>
              <option value="increment">Increment</option>
            </select>
          </label>
          {(mode === 'delay' || mode === 'increment') && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-ink-mute">Seconds per move</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10"
                className="w-28 rounded-md border border-rule bg-card px-3 py-1.5"
              />
            </label>
          )}
          <p className="basis-full text-xs text-ink-mute">
            Time control: normally the TimeControl tag (like G70/d10) is read from the PGN. Fill
            these in only when that tag is missing or wrong, then convert again.
          </p>
        </div>

        <p className="mb-2 truncate text-xs text-ink-mute">
          {sourceFileName ?? 'paste below, or upload a file'}
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            onTextChange(e.target.value)
            onSourceFileNameChange(null)
          }}
          spellCheck={false}
          aria-label="Source PGN"
          placeholder={'[Event "..."]\n[TimeControl "G70/d10"]\n\n1. d4 {[%emt 0:00:00]} d5 {[%emt 0:00:05]} ...'}
          className={PANE_CLASS}
        />
      </Pane>

      <Pane
        title="PGN Header Editor"
        hint="edits flow into the converted PGN, the download, and the copy"
        open={panes.headers}
        onOpenChange={(open) => onPaneChange('headers', open)}
        locked={locked}
        lockedHint={lockedHint}
      >
        <TagEditor headers={headers} onChange={onHeaderChange} opening={opening} />
      </Pane>

      <Pane
        title="Converted PGN"
        hint="the %clk output, reflecting your tag edits"
        open={panes.converted}
        onOpenChange={(open) => onPaneChange('converted', open)}
        locked={locked}
        lockedHint={lockedHint}
      >
        <div className="mb-2.5">
          <PgnExtrasSwitches extras={extras} onChange={onExtraChange} hasEvals={hasEvals} />
        </div>
        <textarea
          readOnly
          value={convertedPgn ?? ''}
          spellCheck={false}
          aria-label="Converted PGN"
          placeholder="Convert a game to see the %clk output here."
          className={PANE_CLASS}
        />
      </Pane>

      <Pane
        title="Export PGN"
        hint="take the converted game elsewhere"
        open={panes.export}
        onOpenChange={(open) => onPaneChange('export', open)}
        locked={locked}
        lockedHint={lockedHint}
      >
        {convertedPgn && (
          <div className="flex flex-wrap items-center gap-2">
            <PgnActions pgn={convertedPgn} fileName={downloadName} compact />
            <button
              type="button"
              onClick={() => {
                // Already signed in: straight to the studies. Otherwise the
                // Lichess window opens here, in the click itself — a pop-up
                // asked for any later is one the browser may refuse — and the
                // dialog stays out of the way until there is something to
                // show: the studies on success, the error otherwise.
                if (loadSession()) {
                  setAuthError(null)
                  setStudyOpen(true)
                  return
                }
                const attempt = ++authAttempt.current
                const opened = openSignInWindow()
                setAuthBusy(true)
                void (async () => {
                  try {
                    const { token, expiresAt } = await signIn(opened)
                    const { username } = await fetchAccount(token)
                    saveSession({ token, expiresAt, username })
                    if (attempt !== authAttempt.current) return
                    setAuthError(null)
                    setStudyOpen(true)
                  } catch (e) {
                    if (attempt !== authAttempt.current) return
                    setAuthError(e instanceof Error ? e.message : String(e))
                    setStudyOpen(true)
                  } finally {
                    if (attempt === authAttempt.current) setAuthBusy(false)
                  }
                })()
              }}
              className="flex items-center gap-1.5 rounded-lg bg-felt px-3 py-1.5 text-sm font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
                <path d="M8 8h6M8 12h6" />
              </svg>
              {authBusy ? 'Waiting for Lichess…' : 'Lichess Study'}
            </button>
          </div>
        )}
      </Pane>

      {studyOpen && convertedPgn && (
        <LichessStudyDialog
          pgn={convertedPgn}
          defaultChapterName={downloadName.replace(/\.pgn$/i, '')}
          initialError={authError}
          onClose={() => setStudyOpen(false)}
        />
      )}

      {error && (
        <div role="alert" className="shrink-0">
          <p className="rounded-lg bg-danger-bg px-4 py-2.5 text-sm text-danger-text">{error}</p>
        </div>
      )}

      {/*
        Page level, not inside a pane: nested in one it would unmount whenever
        that pane closed and null the ref the Upload button clicks.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pgn,.txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) loadFile(file)
          e.target.value = ''
        }}
      />
    </section>
  )
}
