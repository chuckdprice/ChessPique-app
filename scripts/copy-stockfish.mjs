// Copy the lite single-threaded Stockfish build into public/ so it is served
// as a static asset and can be loaded as a Web Worker. Runs on postinstall.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'node_modules', 'stockfish', 'bin')
const destDir = join(root, 'public', 'stockfish')

// Single-threaded lite NNUE build: no SharedArrayBuffer / COOP-COEP needed.
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']

if (!existsSync(srcDir)) {
  console.error('copy-stockfish: node_modules/stockfish/bin not found — run npm install first.')
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
for (const file of files) {
  const src = join(srcDir, file)
  const dest = join(destDir, file)
  const fresh =
    existsSync(dest) && statSync(dest).size === statSync(src).size
  if (!fresh) {
    copyFileSync(src, dest)
    console.log(`copy-stockfish: copied ${file}`)
  }
}
