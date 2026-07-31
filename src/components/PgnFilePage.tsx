import { useRef, useState } from 'react'
import type { ConvertOptions } from '../lib/convert'
import PgnActions from './PgnActions'
import TagEditor from './TagEditor'

interface PgnFilePageProps {
  onConvert: (text: string, options: ConvertOptions) => void
  error: string | null
  /** Source PGN lives in App so it survives navigating between pages. */
  text: string
  onTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  /** Converted PGN for the second tab; null before a successful conversion. */
  convertedPgn: string | null
  downloadName: string
  /** PGN tags for the left pane; empty until a game has been converted. */
  headers: Array<{ name: string; value: string }>
  onHeaderChange: (index: number, value: string) => void
  /** Open the time-control override fields (set when auto-detection fails). */
  overridesOpen: boolean
  onOverridesOpenChange: (open: boolean) => void
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'

type PgnTab = 'original' | 'converted'

const TABS: Array<{ id: PgnTab; label: string }> = [
  { id: 'original', label: 'Original PGN' },
  { id: 'converted', label: 'Converted PGN' },
]

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
  overridesOpen,
  onOverridesOpenChange,
}: PgnFilePageProps) {
  const [tab, setTab] = useState<PgnTab>('original')
  const [dragOver, setDragOver] = useState(false)
  const [startMinutes, setStartMinutes] = useState('')
  const [mode, setMode] = useState<OverrideMode>('auto')
  const [amount, setAmount] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <section aria-label="PGN file" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <TagEditor headers={headers} onChange={onHeaderChange} />

        <section
          aria-label="PGN text"
          className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
        >
          <div
            role="tablist"
            aria-label="PGN views"
            className="flex shrink-0 gap-1 border-b border-rule px-3 pt-1.5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-t-lg border-b-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'border-felt-bright text-ink'
                    : 'border-transparent text-ink-mute hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            {tab === 'original' && (
              <>
                <div className="mb-3 flex shrink-0 items-center gap-2">
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
                      dragOver
                        ? 'border-felt-bright bg-buff-soft'
                        : 'border-rule hover:border-felt-bright/60'
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
                <p className="mb-2 shrink-0 truncate text-xs text-ink-mute">
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
              </>
            )}

            {tab === 'converted' && (
              <>
                <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                  {convertedPgn ? (
                    <>
                      <PgnActions pgn={convertedPgn} fileName={downloadName} compact />
                      <span className="text-xs text-ink-mute">reflects your tag edits</span>
                    </>
                  ) : (
                    <p className="text-xs text-ink-mute">
                      Download and copy become available once a game is converted.
                    </p>
                  )}
                </div>
                <textarea
                  readOnly
                  value={convertedPgn ?? ''}
                  spellCheck={false}
                  aria-label="Converted PGN"
                  placeholder="Convert a game to see the %clk output here."
                  className={PANE_CLASS}
                />
              </>
            )}
          </div>
        </section>
      </div>

      <details
        open={overridesOpen}
        onToggle={(e) => onOverridesOpenChange(e.currentTarget.open)}
        className="shrink-0 rounded-xl border border-rule bg-card px-4 py-2"
      >
        <summary className="cursor-pointer select-none text-sm font-medium text-ink-mute hover:text-ink">
          Time control override
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-4 pb-1">
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
            Normally the TimeControl tag (like G70/d10) is read from the PGN. Fill these in
            only when that tag is missing or wrong, then convert again.
          </p>
        </div>
      </details>

      {error && (
        <div role="alert" className="shrink-0">
          <p className="rounded-lg bg-danger-bg px-4 py-2.5 text-sm text-danger-text">{error}</p>
        </div>
      )}

      {/*
        Page level, not inside the Original tab: nested in the tab panel it would
        unmount on every tab switch and null the ref the Upload button clicks.
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
