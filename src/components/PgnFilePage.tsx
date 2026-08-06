import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'
import type { ConvertOptions } from '../lib/convert'
import type { Opening } from '../lib/openings'
import { loadSession, openSignInWindow, saveSession, signIn } from '../lib/lichess/oauth'
import { fetchAccount } from '../lib/lichess/studies'
import LichessStudyDialog from './LichessStudyDialog'
import PgnActions from './PgnActions'
import PgnExtrasSwitches from './PgnExtrasSwitches'
import type { PgnExtras } from './PgnExtrasSwitches'
import TagEditor from './TagEditor'

interface PgnFilePageProps {
  onConvert: (text: string, options: ConvertOptions) => void
  error: string | null
  /** Source PGN lives in App so it survives navigating between pages. */
  text: string
  onTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  /** Converted PGN for the right pane; null before a successful conversion. */
  convertedPgn: string | null
  downloadName: string
  /** PGN tags for the header editor; empty until a game has been converted. */
  headers: Array<{ name: string; value: string }>
  onHeaderChange: (index: number, value: string) => void
  /** What the converted PGN carries beyond the moves. */
  extras: PgnExtras
  onExtraChange: (id: keyof PgnExtras, on: boolean) => void
  opening: Opening | null
  hasEvals: boolean
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'
type SourceTab = 'original' | 'headers'

const PANE_CLASS =
  'w-full min-h-0 flex-1 resize-none rounded-lg border border-rule bg-buff-soft/60 px-3 py-2 font-score text-[12px] leading-relaxed placeholder:text-ink-mute/60'

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
}: PgnFilePageProps) {
  const [tab, setTab] = useState<SourceTab>('original')
  const [dragOver, setDragOver] = useState(false)
  const [studyOpen, setStudyOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  // Distinguishes this sign-in attempt from an abandoned earlier one, so a
  // stale failure cannot pop an error over a fresh attempt.
  const authAttempt = useRef(0)
  const [sourceCopied, setSourceCopied] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [startMinutes, setStartMinutes] = useState('')
  const [mode, setMode] = useState<OverrideMode>('auto')
  const [amount, setAmount] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The "Copied" confirmation goes back to reading "Copy" on its own.
  useEffect(() => {
    if (!sourceCopied) return
    const timer = setTimeout(() => setSourceCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [sourceCopied])

  /**
   * A conversion that fails for want of a starting clock is fixed in this box,
   * so the error opens it. Left closed, the message would be pointing at a
   * control that is not on screen.
   */
  useEffect(() => {
    if (error?.includes('starting clock')) setOverridesOpen(true)
  }, [error])

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

  const tabClass = (id: SourceTab) =>
    `rounded-t-lg border-b-2 px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === id ? 'border-felt-bright text-ink' : 'border-transparent text-ink-mute hover:text-ink'
    }`

  return (
    <section aria-label="PGN file" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* Left: where the game comes in, and its tags. */}
        <section
          aria-label="PGN source"
          className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
        >
          <div
            role="tablist"
            aria-label="PGN source views"
            className="flex shrink-0 gap-1 border-b border-rule px-3 pt-1.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'original'}
              onClick={() => setTab('original')}
              className={tabClass('original')}
            >
              Original PGN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'headers'}
              onClick={() => setTab('headers')}
              className={tabClass('headers')}
            >
              PGN Header Editor
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {tab === 'original' && (
              <>
                {/*
                  The way in, and it should look like it: this is the first
                  thing to do on a blank page, so it is the biggest, boldest
                  target on it rather than a button the size of its label.
                */}
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
                  className={`mb-3 flex w-full shrink-0 items-center justify-center gap-3 rounded-xl border-[3px] border-dashed px-4 py-5 transition-colors ${
                    dragOver
                      ? 'border-felt-bright bg-felt/15'
                      : 'border-felt-bright/60 bg-buff-soft/60 hover:border-felt-bright hover:bg-buff-soft'
                  }`}
                >
                  <span aria-hidden="true" className="text-3xl leading-none">
                    ♞
                  </span>
                  <span className="text-left">
                    <span className="block text-base font-semibold">
                      Upload or drop a .pgn file
                    </span>
                    <span className="block text-xs text-ink-mute">
                      from your ChessNoteR — converts as soon as it lands
                    </span>
                  </span>
                </button>

                <details
                  open={overridesOpen}
                  onToggle={(e) => setOverridesOpen(e.currentTarget.open)}
                  className="mb-3 shrink-0 rounded-lg border border-rule bg-buff-soft/20 px-3 py-2"
                >
                  <summary className="cursor-pointer select-none text-sm font-medium text-ink-mute hover:text-ink">
                    Time control override
                  </summary>
                  {/*
                    A plain block wraps the flex row rather than carrying the
                    flex itself: a closed <details> hides its content through
                    the UA stylesheet, and an author `display` on the direct
                    child can win that fight and leave the controls on show.
                  */}
                  <div className="mt-3 pb-1">
                    <div className="flex flex-wrap items-end gap-4">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs text-ink-mute">
                          Starting time (minutes)
                        </span>
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
                        Normally the TimeControl tag (like G70/d10) is read from the PGN. Fill
                        these in only when that tag is missing or wrong, then analyze again.
                      </p>
                    </div>
                  </div>
                </details>

                <p className="mb-2 shrink-0 truncate text-xs text-ink-mute">
                  {sourceFileName ?? 'or paste below'}
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
                <div className="mt-3 flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void (async () => {
                      if (await copyText(text)) setSourceCopied(true)
                    })()}
                    disabled={text.trim() === ''}
                    className="rounded-lg border border-rule px-4 py-2 font-medium text-ink transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sourceCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onConvert(text, buildOptions())}
                    disabled={text.trim() === ''}
                    className="rounded-lg bg-felt px-5 py-2 font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Analyze Game
                  </button>
                </div>
              </>
            )}

            {tab === 'headers' && (
              <TagEditor headers={headers} onChange={onHeaderChange} opening={opening} />
            )}
          </div>
        </section>

        {/* Right: the finished file, and the ways out of the app with it. */}
        <section
          aria-label="Converted PGN"
          className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
        >
          <div className="shrink-0 border-b border-rule px-4 py-2">
            <h2 className="font-display text-base font-semibold">Converted PGN</h2>
            <div className="mt-1.5">
              <PgnExtrasSwitches extras={extras} onChange={onExtraChange} hasEvals={hasEvals} />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            <textarea
              readOnly
              value={convertedPgn ?? ''}
              spellCheck={false}
              aria-label="Converted PGN"
              placeholder="Convert a game to see the %clk output here."
              className={PANE_CLASS}
            />

            <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
              {convertedPgn ? (
                <>
                  <PgnActions pgn={convertedPgn} fileName={downloadName} compact />
                  <button
                    type="button"
                    onClick={() => {
                      // Already signed in: straight to the studies. Otherwise
                      // the Lichess window opens here, in the click itself — a
                      // pop-up asked for any later is one the browser may
                      // refuse — and the dialog stays out of the way until
                      // there is something to show.
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
                </>
              ) : (
                <p className="text-xs text-ink-mute">
                  Copy, download and the Lichess and Chess.com links appear once a game is
                  converted.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div role="alert" className="shrink-0">
          <p className="rounded-lg bg-danger-bg px-4 py-2.5 text-sm text-danger-text">{error}</p>
        </div>
      )}

      {/*
        Page level, not inside a tab panel: nested in one it would unmount on
        every tab switch and null the ref the Upload button clicks.
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

      {studyOpen && convertedPgn && (
        <LichessStudyDialog
          pgn={convertedPgn}
          defaultChapterName={downloadName.replace(/\.pgn$/i, '')}
          initialError={authError}
          onClose={() => setStudyOpen(false)}
        />
      )}
    </section>
  )
}
