import { useEffect, useRef } from 'react'

interface HelpDialogProps {
  onClose: () => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink-mute">{children}</div>
    </section>
  )
}

/** Inline name of a control, so prose can point at the real button labels. */
function Ui({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-rule bg-buff-soft px-1.5 py-0.5 font-score text-[11px] text-ink">
      {children}
    </kbd>
  )
}

export default function HelpDialog({ onClose }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        // Only a press that starts on the backdrop closes, so a drag that ends
        // outside while selecting text inside does not.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-rule bg-card text-ink shadow-lg"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-4">
          <div>
            <h2 id="help-title" className="font-display text-lg font-semibold">
              How to use this app
            </h2>
            <p className="mt-0.5 text-xs text-ink-mute">
              Convert a ChessNoteR PGN, then review the game with Stockfish.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="shrink-0 rounded-lg border border-rule px-3 py-1.5 text-sm font-medium transition-colors hover:bg-buff-soft"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Section title="What it does">
            <p>
              ChessNoteR writes each move's elapsed time as <code>{'{[%emt 0:01:23]}'}</code>, which
              most chess sites ignore. This app rebuilds those into the running clock comments{' '}
              <code>{'{[%clk 1:07:00]}'}</code> that Lichess and Chess.com understand, tidies the{' '}
              <Ui>TimeControl</Ui> tag, and then reviews the game with Stockfish.
            </p>
            <p>
              A PGN that already has <code>%clk</code> times works too, as does a plain move list
              with no clocks at all — you just won't get the timing charts.
            </p>
          </Section>

          <Section title="Step 1 — PGN File">
            <p>
              Paste your game into <Ui>Original PGN</Ui>, or use <Ui>Upload or drop a .pgn file</Ui>
              . Dropping a file converts it straight away. Otherwise press{' '}
              <Ui>Convert to %clk</Ui>.
            </p>
            <p>
              The converted game appears on the <Ui>Converted PGN</Ui> tab, where you can copy it to
              the clipboard or download it. Edit any tag on the left and the converted text, the
              download, and the file name all follow along.
            </p>
            <p>
              If the clock times come out wrong, or you see an error about the starting clock, open{' '}
              <Ui>Time control override</Ui> at the bottom and set the starting minutes plus any
              delay or increment, then convert again.
            </p>
          </Section>

          <Section title="Step 2 — Game Analysis">
            <p>
              Stockfish reviews the whole game automatically; the banner above the board tracks its
              progress, and the charts fill in as it finishes. Everything else is usable while it
              runs.
            </p>
            <p>
              Step through the game with the buttons under the board, by clicking a move in the
              list, or with the keyboard. The bar beside the board shows who stands better, and the
              strip beside it shows captured material.
            </p>
            <p>
              Turn on <Ui>SF 18</Ui> for a live engine on the current position: its best lines are
              drawn as blue arrows, shaded from best to worst, with the move actually played in
              orange. The gear beside it sets search time, number of lines, and memory.
            </p>
          </Section>

          <Section title="The four analysis tabs">
            <p>
              <Ui>Evaluation</Ui> — how the advantage swung, with a dot on each notable move.
              Click the chart to jump to that point in the game.
            </p>
            <p>
              <Ui>Phase Accuracy</Ui> — each player's accuracy in the opening, middlegame, and
              endgame.
            </p>
            <p>
              <Ui>Move Classification</Ui> — how many moves of each quality both players made, with
              their rating and an estimated "played like" rating.
            </p>
            <p>
              <Ui>Move Times</Ui> — lines for time remaining, bars for time spent per move.
            </p>
          </Section>

          <Section title="Keyboard">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Key>←</Key> <Key>→</Key> previous and next move · <Key>Home</Key> start ·{' '}
              <Key>End</Key> final position · <Key>Esc</Key> closes this window.
            </p>
          </Section>

          <Section title="About the ratings">
            <p>
              Accuracy comes from how much winning chance each move gave up, using the Lichess
              formula. The "played like" rating is calibrated against rated Lichess rapid games, so
              it sits on that scale, which runs higher than USCF or FIDE over-the-board ratings.
            </p>
            <p>
              One game is a weak signal. Treat the number as a rough indicator, not a measurement.
            </p>
          </Section>

          <Section title="Bugs and suggestions">
            <p>
              Click <Ui>Chuck Price</Ui> in the header, just under the title, to open my Lichess
              profile — then use <Ui>Send message</Ui> there to reach my inbox. Sending one needs a
              Lichess account of your own.
            </p>
            <p>
              For a bug, the most useful thing you can include is the PGN that caused it and what
              you expected to happen instead. Copy it from the <Ui>Original PGN</Ui> tab and paste
              it into the message; if a clock or a chart looked wrong, say which move.
            </p>
            <p>
              Suggestions are just as welcome, including ones about wording, layout, or anything
              here that was confusing to read.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
