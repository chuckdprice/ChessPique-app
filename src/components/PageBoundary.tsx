import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface PageBoundaryProps {
  children: ReactNode
  /** Changing this clears a caught error — navigating is a fresh attempt. */
  resetKey: string
}

interface PageBoundaryState {
  message: string | null
}

/**
 * Keeps a failure on one page from taking the whole app with it.
 *
 * `BoardBoundary` does this for the board, for the same reason and after the
 * same symptom; this is the outer one. An uncaught error anywhere in a React
 * subtree unmounts the tree above it, so a single bad render blanks the window
 * — no header, no menu, no way back, and nothing on screen saying what
 * happened. It has now done that twice: once from react-chessboard failing to
 * measure a square, and once from a study cached before `LibraryGame` gained a
 * field, where every game's `tags` was undefined and the list threw on the
 * first row. That second one blanked the page *only* for studies the reader had
 * opened before, which is a horrible shape for a bug to have.
 *
 * A boundary does not make either of those correct. It makes them survivable
 * and, more usefully, legible: the message is on screen instead of only in a
 * console nobody had open.
 */
export default class PageBoundary extends Component<PageBoundaryProps, PageBoundaryState> {
  state: PageBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): PageBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('A page failed to render:', error, info.componentStack)
  }

  componentDidUpdate(previous: PageBoundaryProps) {
    if (this.state.message && previous.resetKey !== this.props.resetKey) {
      this.setState({ message: null })
    }
  }

  render() {
    const { message } = this.state
    if (!message) return this.props.children

    return (
      <div role="alert" className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-warn-text/25 bg-warn-bg p-5 text-center text-warn-text shadow-md">
          <p className="font-display text-base font-semibold">This page stopped drawing.</p>
          <p className="mt-2 text-sm">
            The menu at the top left still works, and moving to another page tries again. If it
            keeps happening on the library, the local copy of a study may be from an older version
            of the app — <span className="font-medium">Refresh</span> there downloads it again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ message: null })}
            className="mt-3 rounded-lg border border-warn-text/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-warn-text/10"
          >
            Try again
          </button>
          <p className="mt-3 font-score text-[10px] opacity-70">{message}</p>
        </div>
      </div>
    )
  }
}
