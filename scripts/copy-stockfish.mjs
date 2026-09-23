// Copy the lite single-threaded Stockfish build into public/ so it is served
// as a static asset and can be loaded as a Web Worker. Runs on postinstall.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'node_modules', 'stockfish', 'bin')
const isolatedSrcDir = join(root, 'node_modules', '@lichess-org', 'stockfish-web')
const destDir = join(root, 'public', 'stockfish')

// Two engines, and both are Stockfish 19 on the same net (nn-61e7af4bb97d —
// lite-single embeds it, sf_19_smallnet fetches it from /nnue).
//
//  - lite-single: no SharedArrayBuffer needed, so it works whether or not the
//    page is cross-origin isolated. The fallback, and what runs in Node.
//  - sf_19_smallnet: can spawn threads, and therefore needs isolation. Picked
//    at runtime by uci.ts when `crossOriginIsolated` is true.
const files = [
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
]
const isolated = ['sf_19_smallnet.js', 'sf_19_smallnet.wasm']

if (!existsSync(srcDir)) {
  console.error('copy-stockfish: node_modules/stockfish/bin not found — run npm install first.')
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })

/** Copy when the destination is missing or a different size. */
function sync(from, name) {
  const src = join(from, name)
  const dest = join(destDir, name)
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) return
  copyFileSync(src, dest)
  console.log(`copy-stockfish: copied ${name}`)
}

for (const file of files) sync(srcDir, file)

// The isolated build is a hard requirement once the headers are on, so a
// missing package is an error rather than a warning — a build that quietly
// omits it produces a site whose engine 404s only for isolated visitors, which
// is every visitor.
if (!existsSync(isolatedSrcDir)) {
  console.error('copy-stockfish: @lichess-org/stockfish-web not found — run npm install.')
  process.exit(1)
}
for (const file of isolated) sync(isolatedSrcDir, file)
