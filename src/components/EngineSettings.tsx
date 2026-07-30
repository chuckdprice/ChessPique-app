import type { EngineSettings } from '../lib/settings'

interface EngineSettingsPanelProps {
  value: EngineSettings
  onChange: (next: EngineSettings) => void
  onClose: () => void
}

function SliderRow({
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
      </div>
    </div>
  )
}
