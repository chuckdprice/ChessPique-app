/**
 * What this app is built out of, and under what terms.
 *
 * Kept here rather than generated at build time because the list is short and
 * changes rarely, and because half of it is not npm at all — the engine's NNUE,
 * Maia's weights, the piece sets and the font have licences that no package
 * manifest records. `licenses.test.ts` guards the npm half against drift: add a
 * dependency without adding it here and the test says so.
 *
 * The distinction that matters is at the bottom of this file. Permissive
 * licences (MIT, BSD, Apache, CC BY, OFL) are discharged by naming the work and
 * its author, which is what this screen does. Copyleft licences are not: GPL
 * asks that the corresponding source be available to anyone the work is
 * distributed to, and AGPL asks the same of anyone who merely interacts with it
 * over a network. Attribution does not satisfy either.
 */

export interface LicenseRow {
  name: string
  license: string
  /** Where the work lives, for the reader who wants to check. */
  url?: string
  /** Who made it, where a package manifest would not say. */
  author?: string
}

export interface LicenseGroup {
  title: string
  note?: string
  rows: LicenseRow[]
}

/** Licences that require source, not just a credit. Rendered differently. */
export const COPYLEFT = ['GPL-2.0-or-later', 'GPL-3.0', 'AGPL-3.0']

export function isCopyleft(license: string): boolean {
  return COPYLEFT.includes(license)
}

/**
 * Every direct dependency in package.json, runtime and build alike.
 *
 * Build tooling is included deliberately: it is not shipped to the browser, but
 * "used to build this app" is the claim the screen makes, and a reader looking
 * for what went into it should not have to guess where the line was drawn.
 */
export const PACKAGES: LicenseRow[] = [
  { name: '@tailwindcss/vite', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: '@types/node', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react-dom', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@vercel/analytics', license: 'MIT', url: 'https://github.com/vercel/analytics' },
  { name: '@vercel/speed-insights', license: 'Apache-2.0', url: 'https://github.com/vercel/speed-insights' },
  { name: '@vitejs/plugin-react', license: 'MIT', url: 'https://github.com/vitejs/vite-plugin-react' },
  { name: 'chess.js', license: 'BSD-2-Clause', url: 'https://github.com/jhlywa/chess.js' },
  { name: 'onnxruntime-web', license: 'MIT', url: 'https://github.com/microsoft/onnxruntime' },
  { name: 'react', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'react-chessboard', license: 'MIT', url: 'https://github.com/Clariity/react-chessboard' },
  { name: 'react-dom', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'recharts', license: 'MIT', url: 'https://github.com/recharts/recharts' },
  { name: 'stockfish', license: 'GPL-3.0', url: 'https://github.com/nmrugg/stockfish.js' },
  { name: 'tailwindcss', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'typescript', license: 'Apache-2.0', url: 'https://github.com/microsoft/TypeScript' },
  { name: 'vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'vitest', license: 'MIT', url: 'https://github.com/vitest-dev/vitest' },
]

/** The engine, the neural networks, and the font — none of them npm packages. */
export const ASSETS: LicenseRow[] = [
  {
    name: 'Stockfish 19',
    author: 'The Stockfish developers',
    license: 'GPL-3.0',
    url: 'https://github.com/official-stockfish/Stockfish',
  },
  {
    name: 'NNUE network nn-61e7af4bb97d',
    author: 'Chris Bao (sscg13), via the Stockfish project',
    license: 'GPL-3.0',
    url: 'https://tests.stockfishchess.org/nns',
  },
  {
    name: 'Maia-3',
    author: 'UofT Computational Social Science Lab',
    license: 'AGPL-3.0',
    url: 'https://github.com/CSSLab/maia3',
  },
  {
    name: 'Lora',
    author: 'Cyreal',
    license: 'OFL-1.1',
    url: 'https://fonts.google.com/specimen/Lora',
  },
]

/** Board pieces. Every set here is permissive or attribution-only, on purpose. */
export const PIECES: LicenseRow[] = [
  {
    name: 'Classic, Merida',
    author: 'Colin M.L. Burnett; Armando Hernandez Marroquin',
    license: 'GPL-2.0-or-later',
  },
  { name: 'Chessnut', author: 'Alexis Luengas', license: 'Apache-2.0' },
  { name: 'Fantasy, Spatial, Celtic', author: 'Maurizio Monge', license: 'MIT' },
  { name: 'Rhos', author: 'RhosGFX', license: 'CC0-1.0' },
  { name: 'Kiwen Suwi', author: 'neverRare', license: 'CC-BY-4.0' },
  { name: 'Firi', author: 'James Faure', license: 'CC-BY-4.0' },
  { name: 'Totoy', author: 'Kosal Sen', license: 'CC-BY-4.0' },
  { name: 'Papercut', author: 'Nikolay Anzarov', license: 'CC-BY-4.0' },
]

export const GROUPS: LicenseGroup[] = [
  { title: 'Engine, models and type', rows: ASSETS },
  {
    title: 'Piece sets',
    note:
      'From the Lichess project. Several of the nicest sets there are ' +
      'non-commercial and were deliberately left out.',
    rows: PIECES,
  },
  { title: 'Packages', rows: PACKAGES },
]

/**
 * Where the source is, which is the part a credit cannot replace.
 *
 * Both Stockfish and Maia are copyleft, and Maia's AGPL reaches anyone who uses
 * the app over a network rather than only someone handed a copy. Naming them is
 * not compliance; this is.
 *
 * The repository went public on 22 September 2026 and this replaced a written
 * offer to send the source on request, which was the honest thing to say while
 * it was private and weaker than what AGPL-3.0 §13 asks for — source served
 * from a network server. Before that it briefly named a repository nobody could
 * open, which was worse than either.
 *
 * So: this link has to keep resolving for an anonymous visitor. If the
 * repository is ever made private again, the sentence in `LicensesDialog` has
 * to change back with it, and the test below is what makes that impossible to
 * forget quietly.
 */
export const SOURCE_URL = 'https://github.com/chuckdprice/ChessPique-app'
