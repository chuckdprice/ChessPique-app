import type { RefObject } from 'react'
import type { EngineSettings } from '../lib/settings'
import { MODEL_BYTES } from '../lib/maia/session'
import SettingsPopover from './SettingsPopover'

/**
 * The download is worth being plain about rather than burying. The app's
 * promise is that a game never leaves the browser, and that still holds: this
 * sends nothing out, it pulls a file in — from this site, not a third party —
 * and keeps it so it happens once.
 */
export const MAIA_CAPTION =
  `What a player of a given rating would probably play, beside what is best. ` +
  `Downloads a ${Math.round(MODEL_BYTES / 1e6)} MB model from this site the first ` +
  `time, then keeps it. Your games are never uploaded.`

interface EngineSettingsPanelProps {
  value: EngineSettings
  onChange: (next: EngineSettings) => void
  onClose: () => void
  /** The gear this hangs off, which is what it is positioned against. */
  anchor: RefObject<HTMLElement | null>
}

/** Exported so the Settings page offers the same controls as this popover. */
export function SliderRow({
  label,
  display,
  min,
  max,
  step,
  value,
  disabled,
  caption,
  onChange,
}: {
  label: string
  display: string
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  caption?: string
  onChange?: (v: number) => void
}) {
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-score text-xs text-ink-mute">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="mt-1.5 w-full accent-(--accent)"
      />
      {caption && <span className="mt-0.5 block text-xs text-ink-mute">{caption}</span>}
    </label>
  )
}

/** Exported for the same reason as SliderRow: both places offer this switch. */
export function SwitchRow({
  label,
  caption,
  checked,
  onChange,
}: {
  label: string
  caption?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {caption && <span className="mt-0.5 block text-xs text-ink-mute">{caption}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-felt' : 'bg-rule'
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-card shadow transition-[left] ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

/**
 * The gear on the engine panel: how Stockfish searches, and nothing else.
 *
 * What is drawn on the board — the arrow numbers, and whether Maia runs at all
 * — moved to the board's own menu, beside the board those things appear on.
 * This panel sits on a heading that carries the engine's name, and everything
 * under it should be about that engine.
 */
export default function EngineSettingsPanel({
  value,
  onChange,
  onClose,
  anchor,
}: EngineSettingsPanelProps) {
  return (
    <SettingsPopover anchor={anchor} title="Engine Settings" onClose={onClose}>
      <SliderRow
        label="Search time"
        display={`${value.searchTimeSec}s`}
        min={1}
        max={30}
        step={1}
        value={value.searchTimeSec}
        onChange={(v) => onChange({ ...value, searchTimeSec: v })}
      />
      <SliderRow
        label="Multiple lines"
        display={`${value.multiPv} / 5`}
        min={1}
        max={5}
        step={1}
        value={value.multiPv}
        onChange={(v) => onChange({ ...value, multiPv: v })}
      />
      <SliderRow
        label="Threads"
        display={`1 / ${typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1}`}
        min={1}
        max={1}
        step={1}
        value={1}
        disabled
        caption="Single-threaded in browser WASM"
      />
      <SliderRow
        label="Memory"
        display={`${value.hashMb}MB`}
        min={16}
        max={512}
        step={16}
        value={value.hashMb}
        onChange={(v) => onChange({ ...value, hashMb: v })}
      />
    </SettingsPopover>
  )
}
