import { useEffect, useRef, useState } from 'react'
import type { ConvertOptions } from '../lib/convert'

export type StartMode = 'menu' | 'upload' | 'paste'

interface StartPageProps {
  /** Where the app begins, and what a nav item asked for on the way in. */
  mode: StartMode
  onModeChange: (mode: StartMode) => void
  onConvert: (text: string, options: ConvertOptions) => void
  onNewGame: () => void
  onOpenStudy: () => void
  /** Why the last conversion failed; null when nothing has gone wrong. */
  error: string | null
  /** Source PGN lives in App so it survives leaving this page and coming back. */
  text: string
  onTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'

/**
 * The four ways in.
 *
 * This is what the app opens on, and it replaced a two-step tab bar that asked
 * every visitor to understand a workflow — PGN File, then Game Analysis —
 * before it would show them anything. The four things a reader might actually
 * want are on screen instead, and once one of them lands, the analysis takes
 * the whole page and this is gone until asked for again.
 */
export default function StartPage({
  mode,
  onModeChange,
  onConvert,
  onNewGame,
  onOpenStudy,
  error,
  text,
  onTextChange,
  sourceFileName,
  onSourceFileNameChange,
}: StartPageProps) {
  const [dragOver, setDragOver] = useState(false)
  const [overridesOpen, setOverridesOpen] = useState(false)
  const [startMinutes, setStartMinutes] = useState('')
  const [tcMode, setTcMode] = useState<OverrideMode>('auto')
  const [amount, setAmount] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  /**
   * A conversion that fails for want of a starting clock is fixed in that box,
   * so the error opens it — and opens the panel it lives in, which on this page
   * may not be showing at all.
   */
  useEffect(() => {
    if (!error) return
    onModeChange('paste')
    if (error.includes('starting clock')) setOverridesOpen(true)
  }, [error, onModeChange])

  useEffect(() => {
    if (mode === 'paste') pasteRef.current?.focus()
  }, [mode])

  const buildOptions = (): ConvertOptions => {
    const options: ConvertOptions = {}
    const minutes = parseInt(startMinutes, 10)
    if (!Number.isNaN(minutes) && minutes > 0) options.startMinutes = minutes
    const amountSeconds = parseInt(amount, 10)
    if (tcMode === 'delay') options.delay = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    if (tcMode === 'increment') options.increment = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    return options
  }

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '')
      onTextChange(content)
      onSourceFileNameChange(file.name)
      onConvert(content, buildOptions())
    }
    reader.readAsText(file)
  }

  return (
    // The whole page is the drop target, not just the upload card: a file
    // aimed at roughly the right place should land, and a card-sized target
    // on a page this empty is a smaller one than the page deserves.
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) loadFile(file)
      }}
      className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-6 rounded-2xl border-[3px] border-dashed p-4 transition-colors ${
        dragOver ? 'border-felt-bright bg-felt/10' : 'border-transparent'
      }`}
    >
      <div className="w-full max-w-3xl">
        <h1 className="text-center font-display text-2xl font-semibold">Start a game</h1>
        <p className="mt-1 text-center text-sm text-ink-mute">
          Convert a scoresheet's clocks, review a game with the engine, or build a repertoire.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Choice
            title="New Analysis"
            caption="An empty board to play moves onto"
            onClick={onNewGame}
            icon={<path d="M12 5v14M5 12h14" />}
          />
          <Choice
            title="Upload or Drop a .pgn File"
            caption="Converts as soon as it lands"
            active={mode === 'upload'}
            onClick={() => {
              onModeChange('upload')
              fileInputRef.current?.click()
            }}
            icon={
              <>
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </>
            }
          />
          <Choice
            title="Paste a PGN Game"
            caption="From Lichess, Chess.com or a ChessNoteR export"
            active={mode === 'paste'}
            onClick={() => onModeChange(mode === 'paste' ? 'menu' : 'paste')}
            icon={
              <>
                <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
                <path d="M8 6H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2" />
              </>
            }
          />
          <Choice
            title="Open from Lichess Study"
            caption="Your studies are the library's folders"
            onClick={onOpenStudy}
            icon={
              <>
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
                <path d="M9 4h9.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H9" />
              </>
            }
          />
        </div>

        {mode !== 'menu' && (
          <section className="mt-4 rounded-xl border border-rule bg-card p-4 shadow-sm">
            <details
              open={overridesOpen}
              onToggle={(e) => setOverridesOpen(e.currentTarget.open)}
              className="mb-3 rounded-lg border border-rule bg-buff-soft/20 px-3 py-2"
            >
              <summary className="cursor-pointer select-none text-sm font-medium text-ink-mute hover:text-ink">
                Time control override
              </summary>
              {/* A plain block wraps the flex row rather than carrying the flex
                  itself: a closed <details> hides its content through the UA
                  stylesheet, and an author `display` on the direct child can
                  win that fight and leave the controls on show. */}
              <div className="mt-3 pb-1">
                <div className="flex flex-wrap items-end gap-4">
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
                      value={tcMode}
                      onChange={(e) => setTcMode(e.target.value as OverrideMode)}
                      className="w-36 rounded-md border border-rule bg-card px-3 py-1.5"
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="none">None</option>
                      <option value="delay">Delay</option>
                      <option value="increment">Increment</option>
                    </select>
                  </label>
                  {(tcMode === 'delay' || tcMode === 'increment') && (
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
                    Normally the TimeControl tag (like G70/d10) is read from the PGN. Fill these in
                    only when that tag is missing or wrong, then analyze again.
                  </p>
                </div>
              </div>
            </details>

            <p className="mb-2 truncate text-xs text-ink-mute">
              {sourceFileName ?? 'Paste a game below'}
            </p>
            <textarea
              ref={pasteRef}
              value={text}
              onChange={(e) => {
                onTextChange(e.target.value)
                onSourceFileNameChange(null)
              }}
              spellCheck={false}
              aria-label="Source PGN"
              rows={8}
              placeholder={'[Event "..."]\n[TimeControl "G70/d10"]\n\n1. d4 {[%emt 0:00:00]} d5 {[%emt 0:00:05]} ...'}
              className="w-full resize-none rounded-lg border border-rule bg-buff-soft/60 px-3 py-2 font-score text-[12px] leading-relaxed placeholder:text-ink-mute/60"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-rule px-4 py-2 font-medium text-ink transition-colors hover:bg-buff-soft"
              >
                Choose a file…
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
          </section>
        )}

        {error && (
          <div role="alert" className="mt-4">
            <p className="rounded-lg bg-danger-bg px-4 py-2.5 text-sm text-danger-text">{error}</p>
          </div>
        )}
      </div>

      {/* Outside the conditional panel, so the ref the Upload card clicks is
          never null at the moment it is needed. */}
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
    </div>
  )
}

function Choice({
  title,
  caption,
  icon,
  active = false,
  onClick,
}: {
  title: string
  caption: string
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-4 rounded-xl border-2 bg-card px-5 py-4 text-left shadow-sm transition-colors ${
        active
          ? 'border-felt-bright bg-felt/10'
          : 'border-rule hover:border-felt-bright hover:bg-buff-soft'
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-7 shrink-0 text-felt"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      <span className="min-w-0">
        <span className="block font-display text-base font-semibold">{title}</span>
        <span className="block text-xs text-ink-mute">{caption}</span>
      </span>
    </button>
  )
}
