import { useEffect, useRef, useState } from 'react'

/** One tab: an icon, and the name it answers to on hover and to a reader. */
export interface TabDef<T extends string> {
  id: T
  label: string
  icon: React.ReactNode
}

function ScrollHint({ side, show }: { side: 'left' | 'right'; show: boolean }) {
  if (!show) return null
  const left = side === 'left'
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex w-7 items-center text-buff ${
        left
          ? 'left-0 justify-start bg-gradient-to-r from-felt via-felt to-transparent pl-0.5'
          : 'right-0 justify-end bg-gradient-to-l from-felt via-felt to-transparent pr-0.5'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={left ? 'M15 18 9 12l6-6' : 'm9 18 6-6-6-6'} />
      </svg>
    </span>
  )
}

/** Short placeholder; the ring in the engine pane carries the live progress. */
/**
 * One pane: a strip of icon tabs over whatever the chosen one renders.
 *
 * The scroll hints stay even though no strip here holds more than three tabs —
 * they cost nothing when there is nothing to scroll to, and the strip still
 * overflows on a narrow phone once the two panes stack.
 */
export default function TabPane<T extends string>({
  tabs,
  label,
  tab,
  onTab,
  action,
  children,
}: {
  tabs: TabDef<T>[]
  label: string
  tab: T
  onTab: (tab: T) => void
  /** Sits at the right of the strip, where the engine panel's gear sits. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState({ left: false, right: false })

  // Which way the strip can still scroll. Watched rather than measured once:
  // it changes with the viewport, and on a phone the strip overflows while on
  // a desktop it does not.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    const update = () => {
      const remaining = strip.scrollWidth - strip.clientWidth - strip.scrollLeft
      setHint({ left: strip.scrollLeft > 1, right: remaining > 1 })
    }

    update()
    strip.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    // The buttons are observed as well as the strip. Watching the strip alone
    // misses the case that matters at first paint: its own box does not change
    // while the labels inside it reflow as the font loads, so the overflow
    // appears without anything firing and the hints never show.
    const observer = new ResizeObserver(update)
    observer.observe(strip)
    for (const button of strip.children) observer.observe(button)

    // Belt and braces for the same first-paint problem.
    document.fonts?.ready.then(update).catch(() => {})

    return () => {
      strip.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  return (
    // min-w-0 on both: two panes side by side in a flex row default to their
    // content's width, and the eval chart is wide enough to push the other one
    // off the panel.
    <section
      aria-label={label}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      {/* Carries the header's colour so the strip reads as chrome, not content. */}
      <div className="relative shrink-0 rounded-t-xl bg-felt">
        <div
          ref={stripRef}
          role="tablist"
          aria-label={label}
          className={`flex gap-1 overflow-x-auto pl-7 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            action ? 'pr-10' : 'pr-7'
          }`}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              // Both, deliberately: the title is the hover tooltip, the
              // aria-label is what the tab is called to anyone not seeing it.
              title={t.label}
              aria-label={t.label}
              onClick={() => onTab(t.id)}
              // The selected tab is outlined on three sides and left open at
              // the bottom, so it reads as continuous with the panel under it.
              // An underline alone was the whole signal before, and against a
              // strip of icons with no labels it was too quiet to find.
              // Unselected tabs carry the same transparent border so that
              // selecting one cannot change any tab's width.
              className={`-mb-px shrink-0 rounded-t-lg border px-3.5 py-1 transition-colors ${
                tab === t.id
                  ? 'border-buff/55 border-b-card bg-buff/12 text-buff'
                  : 'border-transparent text-buff/60 hover:bg-buff/8 hover:text-buff'
              }`}
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
                {t.icon}
              </svg>
            </button>
          ))}
        </div>

        {/*
          Only shown on the side there is actually more to see, so they say
          "there is more that way" rather than decorating both ends always.
          Not focusable: the strip itself scrolls by swipe, wheel or keyboard.
        */}
        <ScrollHint side="left" show={hint.left} />
        <ScrollHint side="right" show={hint.right} />

        {/* Outside the scrolling strip, so it keeps its corner however many
            tabs there are and however narrow the pane gets. */}
        {action && <div className="absolute right-1 top-1.5">{action}</div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>
    </section>
  )
}

