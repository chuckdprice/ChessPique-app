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
              The page is two panes. On the left, where the game comes in, under two tabs; on the
              right, the file it turns into and the ways of taking it elsewhere.
            </p>
            <p>
              <Ui>Original PGN</Ui> — paste your game in, or use{' '}
              <Ui>Upload or drop a .pgn file</Ui>, which converts it straight away. Otherwise
              press <Ui>Analyze Game</Ui>. If the clock times come out wrong, or you see an
              error about the starting clock, set the starting time and any delay or increment in
              the box under that button, then convert again — normally the PGN's own TimeControl
              tag is used and you can leave it alone.
            </p>
            <p>
              <Ui>PGN Header Editor</Ui> — the game's tags, on the second tab. Edit any of them
              and the converted text, the download, and the file name all follow along.
            </p>
            <p>
              <Ui>Converted PGN</Ui> — the finished text on the right, with switches above it for
              what goes in. All four start on. <Ui>Clocks</Ui> writes the converted times as{' '}
              <code>{'{[%clk 0:29:50]}'}</code> — the point of the whole exercise, but you can
              have the moves without them. <Ui>Evals</Ui> writes Stockfish's score on every move
              as <code>{'{[%eval 0.38]}'}</code>. <Ui>Comments</Ui> keeps any notes your source
              PGN had against its moves, and adds the engine's own verdict on a weak one —{' '}
              <code>{'{Inaccuracy. Bb5 was best.}'}</code>. <Ui>Variations</Ui> writes the line
              the engine preferred, in brackets after the move:{' '}
              <code>(5. Bb5 Nd7 6. Bxc6 bxc6)</code>. The last three wait on the review from
              step 2.
            </p>
            <p>
              Under the text: <Ui>Copy</Ui> and <Ui>Download</Ui> take the file;{' '}
              <Ui>Lichess</Ui> and <Ui>Chess.com</Ui> open it for analysis on those sites.
            </p>
            <p>
              <Ui>Lichess Study</Ui> saves the game into one of your own studies as a new
              chapter. Pressing it goes straight to Lichess: the first time, a pop-up asks you to
              grant <span className="font-score text-ink">study:read study:write</span> — enough
              to list your studies and add a chapter, and nothing else on your account — and
              after that it opens on your studies. Pick one, name the chapter, and send it.
            </p>
            <p>
              The sign-in and the upload go straight from your browser to Lichess; this app has
              no server for them to pass through. Your access token is kept in this browser
              until it expires or you press <Ui>Sign out</Ui>, which also revokes it at Lichess.
            </p>
            <p>
              Every converted game also carries an <Ui>Annotator</Ui> tag pointing back at this
              app, so a file you pass on says where it was made, plus <Ui>ECO</Ui> and{' '}
              <Ui>Opening</Ui> tags naming the opening. That name also appears in the header
              editor, where it is read-only because it is worked out from the moves.
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
              strip beside it shows the material one side is up — an even trade cancels out, so
              four pawns apiece show nothing and five against four show one pawn.
            </p>
            <p>
              Turn on <Ui>SF 18</Ui> for a live engine on the current position: its best lines are
              drawn as blue arrows, shaded from best to worst, with the move actually played in
              orange. The gear beside it sets search time, number of lines, and memory.
            </p>
            <p>
              Leaving the engine running on a move lets it search deeper than the whole-game
              review did, and when it does, that move's number in the list is replaced with the
              better one. Hovering a move or its number tells you the depth behind the figure.
              The depth badge beside the score turns green when the search has stopped, so a
              number that has settled is not mistaken for one that is stuck.
            </p>
            <p>
              You can also move the pieces yourself: drag one and the board leaves the game to
              follow your line, with the engine analysing each position as you reach it. A strip
              above the board shows the moves so far, with <Ui>Take back</Ui> to unplay the last
              one and <Ui>Back to game</Ui> to return. Any move of the navigation — a button, the
              move list, or an arrow key — returns as well. Illegal moves snap back, and a pawn
              reaching the last rank always becomes a queen.
            </p>
            <p>
              Nothing you play this way touches the game: the move list, the accuracies, and the
              PGN you export all still describe the moves that were actually played.
            </p>
            <p>
              Under every inaccuracy, mistake, and blunder the list gives the engine's verdict
              and, below it, the line it would have played instead. Those moves are shown rather
              than clickable — they were never played, and the board follows the game.
            </p>
          </Section>

          <Section title="The four analysis tabs">
            <p>
              <Ui>Evaluation</Ui> — how the advantage swung, with a dot on each notable move.
              Click the chart to jump to that point in the game. The opening played is named in
              the top-left corner, matched by position so a transposition still counts.
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
              <Ui>Move Times</Ui> — lines for time remaining, bars for time spent per move. This
              chart jumps the board too: the left half of a move is White's, the right half
              Black's.
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
