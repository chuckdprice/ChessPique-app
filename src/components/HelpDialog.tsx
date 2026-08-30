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
              Review a game with Stockfish, prepare an opening against a real opponent, edit a
              repertoire by hand — and convert a ChessNoteR PGN's clocks on the way in.
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
              <strong>Chessnotes</strong> is somewhere to keep, read and prepare chess games in
              the browser. Nothing you load is uploaded anywhere: the engines, the conversion
              and the editing all run on this machine.
            </p>
            <p>
              It began as a converter, and still is one.{' '}
              <a
                href="https://chessnoter.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                ChessNoteR
              </a>{' '}
              writes each move's elapsed time as <code>{'{[%emt 0:01:23]}'}</code>, which most
              chess sites ignore. Chessnotes rebuilds those into the running clock comments{' '}
              <code>{'{[%clk 1:07:00]}'}</code> that Lichess and Chess.com understand, and tidies
              the <Ui>TimeControl</Ui> tag. A PGN that already has <code>%clk</code> times works
              too, as does a plain move list with no clocks at all — you just won't get the
              timing charts.
            </p>
            <p>
              Then it reviews the game with Stockfish, and — if you ask it to — shows what a
              human of a given rating would probably have played beside what was best.
            </p>
            <p>
              It is an editor as well. A game is held as a tree of moves rather than a list, so a
              position can have more than one continuation: play a move onto the board and it
              joins the game, keep several answers to the same position, write a note against any
              of them, and decide which is the main line. That is what makes it usable for an
              opening repertoire and not only for a game you played — and a game need not come
              from a file at all, since <Ui>New game</Ui> starts an empty board.
            </p>
            <p>
              And it reads the Lichess opening databases from the position on the board, one
              player's games included, which is how you prepare for an opponent you are about to
              face.
            </p>
          </Section>

          <Section title="Getting around">
            <p>
              The button at the top left opens the menu. It reaches both pages —{' '}
              <Ui>PGN File</Ui> and <Ui>Game Analysis</Ui>, the same two the bar under the header
              shows — plus <Ui>Appearance</Ui> for the theme, board and pieces,{' '}
              <Ui>Settings</Ui> for how the engine searches, and this help. <Key>Esc</Key> closes
              it, as does a click anywhere outside it.
            </p>
            <p>
              <Ui>New game</Ui> on that menu starts an empty board with no moves, for building a
              game or a repertoire by hand rather than importing one. It fills in the standard
              tags for you — edit them on the <Ui>PGN Header Editor</Ui> — and the converted PGN
              grows as you play. It asks first if the game already on the board has moves in it.
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
              <code>{'{Inaccuracy. Bb5 was best.}'}</code>. <Ui>Variations</Ui> writes every
              bracketed line — the game's own variations, and the one the engine preferred after
              a weak move: <code>(5. Bb5 Nd7 6. Bxc6 bxc6)</code>. Off, the file is the mainline
              alone. Evals, the engine's verdicts and its suggested lines all wait on the review
              from step 2.
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
              If the board itself ever stops drawing, a note takes its place and the rest of the
              page carries on — the move list, the engine and the export are unaffected, and
              stepping to another move draws it again.
            </p>
            <p>
              If anything in the file did not come through as written, a note above the board says
              so and names it — a variation with an unplayable move in it is dropped, and a move
              with no elapsed time reuses the clock before it. The game is still usable either
              way, so the note can be dismissed.
            </p>
            <p>
              Step through the game with the buttons under the board, by clicking a move in the
              list, or with the keyboard. The button at the left of that row turns the board
              round; the one at the right is the board's own menu. The bar beside the board shows who stands better, and
              each player's own row shows the material they are up, just left of their clock — an
              even trade cancels out, so four pawns apiece show nothing and five against four show
              one pawn, with the lead in pawns beside them.
            </p>
            <p>
              Twist open <Ui>Move Evals</Ui> for a live engine on the current position; twisting
              it shut stops it again. <Ui>SF18: Engine Moves</Ui> lists its best lines, drawn on
              the board as blue arrows shaded from best to worst, with the move actually played
              in orange — and with its evaluation at the arrow's head too, which is worth most
              exactly when the move played was not one the engine listed. The gear beside that
              heading is Stockfish's own settings: search time, number of lines and memory.
            </p>
            <p>
              What gets <em>drawn</em> is the other menu — the one at the right-hand end of the
              row of buttons under the board. It carries the arrow numbers and whether the human
              moves run at all. Both menus close when you click anywhere else, and{' '}
              <Ui>Settings</Ui> on the main menu offers the same two groups in one page.
            </p>
            <p>
              Leaving the engine running on a move lets it search deeper than the whole-game
              review did, and when it does, that move's number in the list is replaced with the
              better one. Hovering a move or its number tells you the depth behind the figure.
              The depth badge beside the title turns green when the search has stopped, so a
              number that has settled is not mistaken for one that is stuck. Hovering any move in
              a line shows the position it leads to on a small board, with that move's squares
              marked.
            </p>
            <p>
              Beside the engine's lines, <Ui>Human Moves</Ui> is a second opinion from a different
              kind of engine. Stockfish answers what is <em>best</em>; Maia-3 answers what is{' '}
              <em>tempting</em> — the move a player of a given rating would most likely play, with
              how often they would play it. The two lists are ranked by different things and have
              nothing to do with each other row by row: one is sorted by how likely a move is, the
              other by how good it is.
            </p>
            <p>
              Each of Maia's moves is coloured by what Stockfish makes of it, on the same scale as
              the move list — green for the engine's own choice, blue, orange and red for an
              inaccuracy, mistake and blunder, and plain ink for the merely fine. That is the
              point of showing them together: a move half the players at your level would find can
              be the one that loses the game. Each also carries the engine's score for it, taken
              from the search that graded it.
            </p>
            <p>
              Maia's moves are drawn on the board as violet arrows, faded from likeliest to
              least. Because Maia scores every legal move, the probability can be shown at the
              head of <em>any</em> arrow — the engine's candidates and the move actually played
              included — so a square can carry both a score and a percentage, stacked. That is
              its own switch in the board menu.
            </p>
            <p>
              The heading is the control — click <Ui>Maia 1500: Human Moves</Ui> to ask a
              different rating, anywhere from 600 to 2600. It starts at whatever the review
              reckons the player to move has been playing at, so it follows the game, and asking
              what a 1200 would play here against an 1800 is one of the more instructive things it
              does. Turn it on under the gear; the first time costs a one-off model download,
              after which it is kept in the browser. Nothing is ever uploaded, and if it fails or
              you are offline the panel is simply Stockfish alone.
            </p>
            <p>
              You can also move the pieces yourself: drag one, or click it and then click where
              it should go. A clicked piece marks its legal squares — a dot to move to, a red
              ring around a piece it can take — and clicking it again puts it back down. Illegal
              moves snap back, and a pawn reaching the last rank always becomes a queen.
            </p>
            <p>
              A move played at a position that already has one is kept as a <em>variation</em>{' '}
              of it, listed under that move in the list and never displacing what was there. A
              move that is already in the game is simply followed. So playing through a line you
              have stored and branching off it are the same gesture, and nothing you try is lost
              when you look at something else.
            </p>
            <p>
              Right-click a move in the list — or hold it, on a touch screen — for what can be
              done with the line it starts. <Ui>Promote</Ui> moves it up one place among the
              alternatives, <Ui>Promote to mainline</Ui> makes it the game's own line all the way
              back to the first move, <Ui>Demote</Ui> moves it down, and{' '}
              <Ui>Delete from here</Ui> removes that move and everything after it.
            </p>
            <p>
              The engine review covers the mainline, so a move in a variation carries no
              accuracy or grade of its own. Turn the engine on and it will analyse whatever
              position the board is showing, variation or not — and promoting a line to the
              mainline runs the review again over the game that has become. That second run is
              quick: positions already searched are remembered, so only what is genuinely new
              is worked out again. Adding a move to the end of a game costs one search, not a
              whole review.
            </p>
            <p>
              Moves the engine had nothing to say about are left uncoloured, so the ones that
              are marked — best in green, inaccuracies in blue, mistakes and blunders warmer —
              stand out rather than competing with a wall of colour.
            </p>
            <p>
              Under every inaccuracy, mistake, and blunder the list gives the engine's verdict,
              and the line it would have played instead is added to the game as a variation of
              that move. It walks like any other line — click it, arrow through it, promote it
              if you decide it was right — and it goes into the exported PGN with the rest.
            </p>
          </Section>

          <Section title="The analysis tabs">
            <p>
              Two panels sit side by side under the board, each with its own row of icon tabs
              that name themselves on hover — so two views are open at once. The left holds the
              charts and the opening explorer, the right the summaries. Read the evaluation chart
              against the move counts, or keep it open beside the comment box while you write the
              game up. On a narrow window the two stack.
            </p>
            <p>
              <Ui>Evaluation</Ui> — how the advantage swung, with a dot on each notable move.
              Click the chart to jump to that point in the game. The opening played is named in
              the top-left corner, matched by position so a transposition still counts.
            </p>
            <p>
              <Ui>Move Times</Ui> — lines for time remaining, bars for time spent per move. This
              chart jumps the board too: the left half of a move is White's, the right half
              Black's. The move you are on is marked with a dashed line and a dot on each
              player's curve, and the figures are reported in a fixed row above the plot — time
              left on the left, time spent on the right — which follows your pointer across the
              chart instead of covering it with a tooltip.
            </p>
            <p>
              <Ui>Opening Explorer</Ui> — what has actually been played from this position, from
              the Lichess databases. <Ui>Masters</Ui> is over-the-board games between titled
              players, <Ui>Lichess</Ui> is rated online games, and <Ui>Player</Ui> is one
              person's games, which is how you prepare against an opponent: choose them by
              username, swap between their games as White and as Black, and see their repertoire
              and how it has scored. Each row gives the move, how often it is played and the
              white/draw/black split; pointing at one lays a grey shadow of it on the board, and
              clicking it plays the move into your game. The gear at the right of the panel's tab
              strip filters each database the way Lichess does — time control, rating band, rated
              or casual, and a date range.
            </p>
            <p>
              This one tab needs a Lichess sign-in: Lichess now requires one for its explorer, so
              the panel offers the same sign-in the study export uses. Only the position on the
              board is ever sent, and Chessnotes keeps to one request at a time so as not to lean
              on their server.
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
              <Ui>Comments</Ui> — a note on the move the board is showing, including a move
              inside a variation, which is how the lines of a repertoire get their names. Write,
              change or delete it and the move list follows as you type; it is the same text the
              converted PGN carries in braces while its <Ui>Comments</Ui> switch is on. Comments
              already in the file you loaded appear here to be edited.
            </p>
          </Section>

          <Section title="Keyboard">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Key>←</Key> <Key>→</Key> previous and next move · <Key>Home</Key> start ·{' '}
              <Key>End</Key> end of the line · <Key>Esc</Key> closes this window.
            </p>
            <p>
              Forward follows the line the board is on rather than the main one, so arrowing
              through a variation stays inside it; back steps out of it at the move it branched
              from. The buttons under the board do the same.
            </p>
            <p>
              Where the position has more than one continuation, going forward offers them in a
              short list instead of choosing for you — the game's own line first, then its
              variations. <Key>↑</Key> and <Key>↓</Key> move through them, <Key>→</Key> takes the
              one marked, and <Key>Esc</Key> leaves the board where it is. Clicking one works too.
              So a variation is reachable by walking to it, not only by finding it in the list.
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
            <p>
              It is also where <Ui>Human Moves</Ui> starts from, which is the other reason it is
              deliberately coarse: it is a sensible place to begin asking the question, not an
              answer in itself. Change the rating on its heading whenever you want a different
              one.
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
