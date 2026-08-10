import type { MoveNode } from '../lib/moveTree'

interface CommentEditorProps {
  /** The move the board is on; the root when it is the starting position. */
  node: MoveNode
  onCommentChange: (nodeId: string, comment: string) => void
}

/**
 * The annotator's note on the move the board is showing.
 *
 * One move at a time, following the board rather than listing every comment in
 * the game: the note belongs to a position, and stepping to it is how you say
 * which one you mean. What is typed here is the same text the move list shows
 * under that move and the converted PGN writes in its braces.
 */
export default function CommentEditor({ node, onCommentChange }: CommentEditorProps) {
  const label =
    node.parent != null && node.san
      ? `${node.number}${node.color === 'w' ? '.' : '…'} ${node.san}`
      : null

  if (!label) {
    return (
      <p className="px-6 py-10 text-center text-sm text-ink-mute">
        Step to a move to write a note against it — the starting position has no move to
        comment on.
      </p>
    )
  }

  const comment = node.comment ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-4 py-2">
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <p className="font-score text-sm font-semibold">{label}</p>
        <button
          type="button"
          onClick={() => onCommentChange(node.id, '')}
          disabled={comment === ''}
          className="rounded-md border border-rule px-2 py-1 text-xs text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(node.id, e.target.value)}
        spellCheck
        aria-label={`Comment on ${label}`}
        placeholder="Write a note about this move…"
        className="min-h-0 w-full flex-1 resize-none rounded-lg border border-rule bg-buff-soft/50 px-3 py-2 text-sm leading-relaxed placeholder:text-ink-mute/60"
      />
      <p className="shrink-0 text-xs text-ink-mute">
        Saved as you type. Comments are written into the converted PGN while its{' '}
        <span className="font-medium text-ink">Comments</span> switch is on.
      </p>
    </div>
  )
}
