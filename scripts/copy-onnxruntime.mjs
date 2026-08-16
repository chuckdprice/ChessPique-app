// Copy onnxruntime-web's loader and WASM into public/ort/, the path the Maia
// worker hands to ort.env.wasm.wasmPaths. Same arrangement as Stockfish: the
// runtime fetches these by URL at run time, so they have to be static assets
// rather than anything the bundler has rewritten. Runs on postinstall.
import { copyFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const destDir = join(root, 'public', 'ort')

// The same three files Maia's own site serves. The build is named "threaded"
// but runs single-threaded when SharedArrayBuffer is missing, which it is here:
// the app sets no COOP/COEP headers, for the same reason the Stockfish build
// is the single-threaded one. The worker pins numThreads to 1 so it does not
// try. Anything else in dist/ is a variant we do not serve.
const files = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']

if (!existsSync(srcDir)) {
  console.error('copy-onnxruntime: node_modules/onnxruntime-web/dist not found — run npm install.')
  process.exit(1)
}

const missing = files.filter((file) => !existsSync(join(srcDir, file)))
if (missing.length) {
  // Names move between onnxruntime-web majors, so say what is actually there
  // rather than leaving a worker that 404s its own runtime at first use.
  console.error(`copy-onnxruntime: missing ${missing.join(', ')} in onnxruntime-web/dist.`)
  console.error(`copy-onnxruntime: dist contains: ${readdirSync(srcDir).join(', ')}`)
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
for (const file of files) {
  const src = join(srcDir, file)
  const dest = join(destDir, file)
  if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) {
    copyFileSync(src, dest)
    console.log(`copy-onnxruntime: copied ${file}`)
  }
}
