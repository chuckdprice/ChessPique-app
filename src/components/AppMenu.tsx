import { useEffect, useRef, useState } from 'react'
import { ACCENTS } from '../lib/settings'
import type { Accent, AppearanceSettings, ThemePreference } from '../lib/settings'

interface AppMenuProps {
  value: AppearanceSettings
  onChange: (next: AppearanceSettings) => void
  onOpenHelp: () => void
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

/** Settings, help, and version, behind one button in the header. */
export default function AppMenu({ value, onChange, onOpenHelp }: AppMenuProps) {
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
        aria-label="Settings and help"
        title="Settings and help"
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
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
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

          <div className="border-t border-rule p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenHelp()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-buff-soft"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 shrink-0 text-ink-mute"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" />
                <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
              How to use this app
            </button>
          </div>

          <div className="border-t border-rule px-4 py-2 text-center">
            <span
              className="font-score text-xs text-ink-mute"
              title={`Version ${__APP_VERSION__}, built from commit ${__APP_COMMIT__}. The last number is the commit count.`}
            >
              v{__APP_VERSION__}
              <span className="ml-1.5 opacity-70">{__APP_COMMIT__}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
