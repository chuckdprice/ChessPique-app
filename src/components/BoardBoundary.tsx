import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface BoardBoundaryProps {
  children: ReactNode
  /**
   * Changing this clears a caught error and lets the board try again.
   *
   * The board is passed the node the game is on, so any navigation is a fresh
   * attempt — which is what recovers from a one-off failure without the user
   * having to notice there was one.
   */
  resetKey: string
}

interface BoardBoundaryState {
  message: string | null
}

/**
 * Keeps a failure inside the board from taking the page with it.
 *
 * react-chessboard measures a square to animate a move and throws "Square
 * width not found" when it cannot — which happens whenever the board has no
 * layout to measure, a hidden tab being the case seen in practice. An
 * uncaught error in a React subtree unmounts the whole app, so a board that
 * could not draw for a moment left a blank page and a lost game.
 *
 * Only the board is wrapped. The move list, the engine and the export all work
 * without it, and they should stay up to be worked with.
 */
export default class BoardBoundary extends Component<BoardBoundaryProps, BoardBoundaryState> {
  state: BoardBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): BoardBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Kept for a bug report: this is a library failure, and the component
    // stack is the only thing that says where in the board it came from.
    console.error('The board failed to draw:', error, info.componentStack)
  }

  componentDidUpdate(previous: BoardBoundaryProps) {
    if (this.state.message && previous.resetKey !== this.props.resetKey) {
      this.setState({ message: null })
    }
  }

  render() {
    const { message } = this.state
    if (!message) return this.props.children

    return (
      <div
        role="alert"
        className="flex size-(--board-size) flex-col items-center justify-center gap-3 rounded-lg border border-warn-text/25 bg-warn-bg p-4 text-center text-warn-text shadow-md"
      >
        <p className="text-sm font-medium">The board stopped drawing.</p>
        <p className="text-xs">
          Your game is safe — the move list and the converted PGN are untouched. Stepping to
          another move tries again on its own.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ message: null })}
          className="rounded-lg border border-warn-text/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-warn-text/10"
        >
          Try again
        </button>
        <p className="font-score text-[10px] opacity-70">{message}</p>
      </div>
    )
  }
}
