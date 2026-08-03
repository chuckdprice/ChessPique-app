import { describe, expect, it } from 'vitest'
import type { Move } from './convert'
import { replayGame } from './gameModel'
import { findOpening } from './openings'

function fensFor(sans: string[]): string[] {
  const moves: Move[] = sans.map((san, i) => ({
    number: Math.floor(i / 2) + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san,
    emtSeconds: null,
    anchorClockSeconds: null,
    clkSeconds: null,
    spentSeconds: null,
  }))
  return replayGame(moves).fens
}

describe('findOpening', () => {
  it('names a common opening by its ECO code', async () => {
    const opening = await findOpening(fensFor(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']))
    expect(opening).not.toBeNull()
    expect(opening?.eco).toBe('C50')
    expect(opening?.name).toMatch(/Italian Game/)
  })

  it('prefers the deepest line the game reached', async () => {
    const sicilian = await findOpening(fensFor(['e4', 'c5']))
    const najdorf = await findOpening(
      fensFor(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']),
    )
    expect(sicilian?.name).toBe('Sicilian Defense')
    expect(najdorf?.name).toMatch(/Najdorf/)
    expect(najdorf?.ply).toBe(10)
  })

  it('follows the game past the point it left the book', async () => {
    // Two moves nobody has a name for; the opening should stay the Najdorf,
    // recorded at the ply the game was last in the book.
    const opening = await findOpening(
      fensFor([
        'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Kd2', 'Kd7',
      ]),
    )
    expect(opening?.name).toMatch(/Najdorf/)
    expect(opening?.ply).toBe(10)
  })

  it('recognizes a transposition, which move-order matching would miss', async () => {
    const direct = await findOpening(fensFor(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']))
    const transposed = await findOpening(fensFor(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'd5']))
    expect(direct).not.toBeNull()
    expect(transposed?.eco).toBe(direct?.eco)
    expect(transposed?.name).toBe(direct?.name)
  })

  it('has no name for the starting position', async () => {
    expect(await findOpening(fensFor([]))).toBeNull()
  })
})
