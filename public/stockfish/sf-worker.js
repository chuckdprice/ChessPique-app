/**
 * Stockfish 19 from `@lichess-org/stockfish-web`, wrapped so it speaks the same
 * postMessage UCI protocol as the shipped `stockfish-19-lite-single.js` worker.
 *
 * Hand-written and served from public/ rather than imported, and that is not
 * laziness — Vite refuses this engine three separate ways, all measured:
 *
 *   1. The dep optimizer rewrites the module into node_modules/.vite/deps/, so
 *      its `locateFile` looks for the .wasm beside *that*, gets the SPA's
 *      index.html back, and dies on the magic word (3c 21 64 6f is `<!do`).
 *   2. `vite:import-analysis` refuses a literal import() of anything under
 *      /public, and runs before `@vite-ignore` is honoured.
 *   3. `vite build` fails outright: "Module format iife does not support
 *      top-level await". Rollup cannot bundle it at all.
 *
 * Loading it from a worker the bundler never sees avoids all three. It is also
 * faster: the dep-optimised module measured 225k nps against 1.16M for the same
 * engine here.
 *
 * Unlike the lite build, this one does not carry its network — the same net,
 * nn-61e7af4bb97d, which lite-single embeds and this fetches. Held in IndexedDB
 * after the first visit, the way Maia's model is.
 */

const NNUE_BASE = '/nnue/'
const DB_NAME = 'chesspique.nnue'
const STORE = 'net'

let engine = null
/** Commands that arrived before the engine could take them. */
const pending = []

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idb(db, mode, run) {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * The net, from IndexedDB or the network.
 *
 * Keyed by filename, which is the net's own SHA-256 prefix — so a new net is a
 * cache miss by construction and there is no version field to keep in step.
 * A cache that cannot be opened is not an error worth failing over: a private
 * window, or blocked site data, should still get a working engine.
 */
async function loadNet(name) {
  let db = null
  try {
    db = await openDb()
    const hit = await idb(db, 'readonly', (store) => store.get(name))
    if (hit) return new Uint8Array(await hit.arrayBuffer())
  } catch {
    db = null
  }

  const response = await fetch(NNUE_BASE + name)
  if (!response.ok) throw new Error(`net ${name} failed (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())

  if (db) {
    // A Blob rather than the buffer, for the same reason maia-worker.js uses
    // one: Safari does not reliably structured-clone a buffer this size.
    try {
      await idb(db, 'readwrite', (store) => store.put(new Blob([bytes]), name))
    } catch {
      // A full or unwritable store costs a download next time, nothing more.
    }
  }
  return bytes
}

async function boot() {
  const module = await import('./sf_19_smallnet.js')
  const sf = await module.default({
    locateFile: (file) => new URL(file, import.meta.url).href,
  })

  sf.listen = (line) => postMessage(String(line))
  sf.onError = (message) => postMessage(`info string error ${message}`)

  // Dual-net builds want two; `getRecommendedNnue` names whichever it wants and
  // returns nothing for an index this build does not use.
  for (const index of [0, 1]) {
    const name = sf.getRecommendedNnue?.(index)
    if (!name) continue
    sf.setNnueBuffer(await loadNet(name), index)
  }

  engine = sf
  for (const command of pending.splice(0)) engine.uci(command)
}

boot().catch((error) => {
  // Loud rather than silent. `Engine.init` is waiting on `uciok` and will time
  // out, and the app falls back to the single-threaded build — but a console
  // line naming the real cause is the difference between a diagnosable failure
  // and a mysterious thirty-second pause.
  console.error('sf-worker: could not start Stockfish', error)
  postMessage(`info string error ${error?.message ?? error}`)
})

onmessage = (event) => {
  const command = String(event.data)
  if (engine) engine.uci(command)
  else pending.push(command)
}
