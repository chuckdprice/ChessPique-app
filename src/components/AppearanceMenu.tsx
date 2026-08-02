import { useEffect, useRef, useState } from 'react'
import { ACCENTS } from '../lib/settings'
import type { Accent, AppearanceSettings, ThemePreference } from '../lib/settings'

interface AppearanceMenuProps {
  value: AppearanceSettings
  onChange: (next: AppearanceSettings) => void
}

const ACCENT_SWATCH: Record<Accent, string> = {
  green: '#2c8161',
  blue: '#2f74e0',
  purple: '#8d61dc',
  orange: '#d4711f',
  red: '#d44848',
}

const THEMES: Array<{ id: ThemePreference; label: string; icon: string }> = [
  { id: 'light', label: 'Light', icon: '☀' },
  { id: 'dark', label: 'Dark', icon: '☾' },
  { id: 'system', label: 'System', icon: '💻' },
]

/** Theme and accent, behind the palette button in the header. */
export default function AppearanceMenu({ value, onChange }: AppearanceMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Appearance settings"
        title="Appearance"
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
          <path d="M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8Z" />
          <circle cx="6.5" cy="11.5" r="0.5" fill="currentColor" />
          <circle cx="9.5" cy="7.5" r="0.5" fill="currentColor" />
          <circle cx="14.5" cy="7.5" r="0.5" fill="currentColor" />
          <circle cx="17.5" cy="11.5" r="0.5" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-rule bg-card text-ink shadow-lg">
          <div className="p-4">
            <h3 className="font-display text-base font-semibold">Appearance</h3>
            <p className="mt-0.5 text-xs text-ink-mute">Customize the look and feel of the app</p>

            <p className="mt-3 mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-mute">
              Theme
            </p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={value.theme === t.id}
                  onClick={() => onChange({ ...value, theme: t.id })}
                  className={`rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                    value.theme === t.id
                      ? 'border-felt bg-felt text-buff'
                      : 'border-rule hover:bg-buff-soft'
                  }`}
                >
                  <span aria-hidden="true" className="mr-1">
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>

            <p className="mt-4 mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-mute">
              Accent color
            </p>
            <div className="flex gap-2.5" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={value.accent === accent}
                  aria-label={`${accent} accent`}
                  onClick={() => onChange({ ...value, accent })}
                  className={`flex size-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                    value.accent === accent ? 'ring-2 ring-ink ring-offset-2 ring-offset-card' : ''
                  }`}
                  style={{ backgroundColor: ACCENT_SWATCH[accent] }}
                >
                  {value.accent === accent && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
