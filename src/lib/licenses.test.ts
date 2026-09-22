import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ASSETS, GROUPS, isCopyleft, PACKAGES, PIECES, SOURCE_REQUEST_URL } from './licenses'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort()

describe('the package list', () => {
  it('names every direct dependency, and nothing that is not one', () => {
    // The whole point of this test: adding a dependency without crediting it is
    // the failure mode a hand-maintained list has, and it is silent otherwise.
    expect(PACKAGES.map((p) => p.name).sort()).toEqual(declared)
  })

  it('gives every row a licence', () => {
    for (const row of [...PACKAGES, ...ASSETS, ...PIECES]) {
      expect(row.license, row.name).toBeTruthy()
    }
  })

  it('links every package somewhere a reader can check', () => {
    for (const row of PACKAGES) {
      expect(row.url, row.name).toMatch(/^https:\/\//)
    }
  })
})

describe('copyleft', () => {
  it('recognises the licences that need source rather than a credit', () => {
    expect(isCopyleft('GPL-3.0')).toBe(true)
    expect(isCopyleft('AGPL-3.0')).toBe(true)
    expect(isCopyleft('GPL-2.0-or-later')).toBe(true)
  })

  it('does not treat a permissive licence as copyleft', () => {
    for (const l of ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'CC0-1.0', 'CC-BY-4.0', 'OFL-1.1']) {
      expect(isCopyleft(l), l).toBe(false)
    }
  })

  it('still finds the copyleft dependencies this app actually ships', () => {
    // If these ever stop being copyleft the source offer below can be
    // reconsidered — until then it is load-bearing, not decoration.
    const copyleft = [...PACKAGES, ...ASSETS].filter((r) => isCopyleft(r.license)).map((r) => r.name)
    expect(copyleft).toContain('stockfish')
    expect(copyleft).toContain('Stockfish 19')
    expect(copyleft).toContain('Maia-3')
  })
})

describe('the source offer', () => {
  it('is an absolute link, because a relative one is not an offer', () => {
    expect(SOURCE_REQUEST_URL).toMatch(/^https:\/\//)
  })

  it('does not point at a repository', () => {
    // The offer is to send the source on request. Pointing at a repository
    // nobody can open was the previous wording, and it asserted something
    // untrue to every reader who tried the link. If the repository is ever
    // published, change the copy in the dialog too — not just this constant.
    expect(SOURCE_REQUEST_URL).not.toMatch(/github\.com/)
  })
})

describe('groups', () => {
  it('covers every row exactly once', () => {
    const grouped = GROUPS.flatMap((g) => g.rows)
    expect(grouped).toHaveLength(PACKAGES.length + ASSETS.length + PIECES.length)
    expect(new Set(grouped.map((r) => r.name)).size).toBe(grouped.length)
  })
})
