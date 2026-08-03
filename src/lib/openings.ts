/**
 * Naming the opening a game played, from the lichess opening book.
 *
 * The book is looked up by position, not by move order, so a transposition
 * still finds its name: 1.Nf3 d5 2.d4 and 1.d4 d5 2.Nf3 reach one position and
 * are one opening. Positions come straight from `replayGame`, which builds them
 * with the same chess.js that generated the book's keys.
 *
 * The book itself is ~420 kB of text and is loaded on demand — the board, the
 * move list and the engine are all more urgent than a caption, and a game with
 * no name pays nothing beyond the one fetch.
 */

export interface Opening {
  /** ECO code, e.g. "C50". */
  eco: string
  /** Full name, e.g. "Italian Game: Anti-Fried Liver Defense". */
  name: string
  /** Ply the game left the book at — where this name was fixed. */
  ply: number
}

interface Book {
  byPosition: Map<string, { eco: string; name: string }>
  maxPlies: number
}

let book: Promise<Book> | null = null

/** FEN minus the halfmove clock and fullmove number, as the book is keyed. */
function epd(fen: string): string {
  return fen.split(' ', 4).join(' ')
}

function loadBook(): Promise<Book> {
  book ??= import('./openings.data').then((mod) => {
    const byPosition = new Map<string, { eco: string; name: string }>()
    for (const line of mod.default.split('\n')) {
      const key = line.indexOf('|')
      const eco = line.indexOf('|', key + 1)
      byPosition.set(line.slice(0, key), {
        eco: line.slice(key + 1, eco),
        name: line.slice(eco + 1),
      })
    }
    return { byPosition, maxPlies: mod.MAX_BOOK_PLIES }
  })
  return book
}

/**
 * The opening a game played, or null when none of its positions are in the book.
 *
 * Searched from the deepest book-eligible ply backwards so the most specific
 * name wins: a Sicilian that reaches the Najdorf is named the Najdorf, which is
 * the last book position it stood in, not the first.
 *
 * @param fens Positions from `replayGame`: fens[0] is the start, fens[i] the
 *   position after ply i.
 */
export async function findOpening(fens: readonly string[]): Promise<Opening | null> {
  const { byPosition, maxPlies } = await loadBook()
  for (let ply = Math.min(fens.length - 1, maxPlies); ply >= 1; ply--) {
    const hit = byPosition.get(epd(fens[ply]))
    if (hit) return { ...hit, ply }
  }
  return null
}
