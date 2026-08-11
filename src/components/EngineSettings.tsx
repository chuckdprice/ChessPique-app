import type { EngineSettings } from '../lib/settings'

interface EngineSettingsPanelProps {
  value: EngineSettings
  onChange: (next: EngineSettings) => void
  onClose: () => void
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

export default function EngineSettingsPanel({
  value,
  onChange,
  onClose,
}: EngineSettingsPanelProps) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-rule bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Engine Settings</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close engine settings"
          className="rounded-md px-2 py-0.5 text-ink-mute hover:bg-buff-soft hover:text-ink"
        >
          ×
        </button>
      </div>
      <div className="mt-3 space-y-4">
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
        <SwitchRow
          label="Scores on arrows"
          caption="Print each candidate's evaluation at the head of its arrow."
          checked={value.arrowEvals}
          onChange={(v) => onChange({ ...value, arrowEvals: v })}
        />
      </div>
    </div>
  )
}
