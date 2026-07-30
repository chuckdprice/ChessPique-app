import { useRef, useState } from 'react'
import type { ConvertOptions } from '../lib/convert'
import PgnActions from './PgnActions'

interface PgnInputProps {
  onConvert: (text: string, options: ConvertOptions) => void
  error: string | null
  /** Source PGN lives in App so it survives navigating between pages. */
  text: string
  onTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  /** Converted PGN to show on the right; null before a successful conversion. */
  convertedPgn: string | null
  downloadName: string
  /** Open the time-control override fields (set when auto-detection fails). */
  overridesOpen: boolean
  onOverridesOpenChange: (open: boolean) => void
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'

export default function PgnInput({
  onConvert,
  error,
  text,
  onTextChange,
  sourceFileName,
  onSourceFileNameChange,
  convertedPgn,
  downloadName,
  overridesOpen,
  onOverridesOpenChange,
}: PgnInputProps) {
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

  const paneClass =
    'w-full flex-1 resize-none rounded-lg border border-rule bg-buff-soft/60 px-3 py-2 font-score text-[12px] leading-relaxed placeholder:text-ink-mute/60'

  return (
    <section aria-label="PGN upload" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* Source PGN */}
        <div className="flex min-h-0 flex-col rounded-xl border border-rule bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold">ChessNoteR PGN</h2>
            <span className="truncate text-xs text-ink-mute">
              {sourceFileName ?? 'paste below, or upload a file'}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              onTextChange(e.target.value)
              onSourceFileNameChange(null)
            }}
            spellCheck={false}
            aria-label="Source PGN"
            placeholder={'[Event "..."]\n[TimeControl "G70/d10"]\n\n1. d4 {[%emt 0:00:00]} d5 {[%emt 0:00:05]} ...'}
            className={paneClass}
          />
          <div className="mt-3 flex items-center gap-2">
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
            <button
              type="button"
              onClick={() => onConvert(text, buildOptions())}
              disabled={text.trim() === ''}
              className="rounded-lg bg-felt px-5 py-2 font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Convert to %clk
            </button>
          </div>
        </div>

        {/* Converted PGN */}
        <div className="flex min-h-0 flex-col rounded-xl border border-rule bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold">Converted PGN</h2>
            <span className="text-xs text-ink-mute">
              {convertedPgn ? 'reflects your tag edits' : 'appears after converting'}
            </span>
          </div>
          <textarea
            readOnly
            value={convertedPgn ?? ''}
            spellCheck={false}
            aria-label="Converted PGN"
            placeholder="Convert a game to see the %clk output here."
            className={paneClass}
          />
          <div className="mt-3 flex justify-end">
            {convertedPgn ? (
              <PgnActions pgn={convertedPgn} fileName={downloadName} />
            ) : (
              <p className="text-xs text-ink-mute">
                Download and copy become available once a game is converted.
              </p>
            )}
          </div>
        </div>
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
    </section>
  )
}
