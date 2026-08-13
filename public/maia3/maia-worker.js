/**
 * Maia-3 inference, off the main thread.
 *
 * A plain worker in public/ rather than a bundled one, for the same reason
 * Stockfish is: onnxruntime-web loads its own WASM by URL at runtime, and a
 * static path it can find is simpler than teaching the bundler about it.
 *
 * Messages in:  { type: 'init', modelUrl, version }
 *               { type: 'download' }
 *               { type: 'infer', id, tokens, eloSelf, eloOppo }
 * Messages out: { type: 'status', status: 'cached'|'absent'|'ready' }
 *               { type: 'progress', loaded, total }
 *               { type: 'result', id, policy, value }
 *               { type: 'error', id?, message }
 *
 * The model is ~43 MB, so it is fetched once on first enable and kept in
 * IndexedDB. `version` is stored alongside it: a model swap has to evict the
 * old bytes, and nothing else would ever invalidate them.
 */

importScripts('/ort/ort.wasm.min.js')

// eslint-disable-next-line no-undef
const ORT = ort
ORT.env.wasm.wasmPaths = '/ort/'
// The app sets no COOP/COEP headers, so there is no SharedArrayBuffer to thread
// with. Saying so up front beats letting the runtime discover it.
ORT.env.wasm.numThreads = 1

const DB_NAME = 'chessnoter.maia'
const STORE = 'model'
const KEY = 'maia3'

let session = null
let modelUrl = null
let version = null

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

/** The cached bytes, or null — including when the cache is for another model. */
async function readCache() {
  const db = await openDb()
  const entry = await idb(db, 'readonly', (store) => store.get(KEY))
  if (!entry) return null
  if (entry.url !== modelUrl || entry.version !== version) {
    await idb(db, 'readwrite', (store) => store.delete(KEY))
    return null
  }
  return await entry.blob.arrayBuffer()
}

async function writeCache(bytes) {
  const db = await openDb()
  // A Blob rather than the buffer: Safari will not structured-clone an
  // ArrayBuffer this size into IndexedDB reliably, and a Blob it stores by
  // reference.
  await idb(db, 'readwrite', (store) =>
    store.put({ url: modelUrl, version, blob: new Blob([bytes]) }, KEY),
  )
}

/** Fetch the model, reporting progress, because 43 MB is a wait worth showing. */
async function fetchModel() {
  const response = await fetch(modelUrl)
  if (!response.ok) throw new Error(`Model fetch failed (${response.status})`)
  const total = Number(response.headers.get('Content-Length')) || 0

  if (!response.body?.getReader) return new Uint8Array(await response.arrayBuffer())

  const reader = response.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    postMessage({ type: 'progress', loaded, total })
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

self.onmessage = async (event) => {
  const message = event.data
  try {
    switch (message.type) {
      case 'init': {
        modelUrl = message.modelUrl
        version = message.version
        const cached = await readCache()
        if (!cached) {
          postMessage({ type: 'status', status: 'absent' })
          return
        }
        session = await ORT.InferenceSession.create(cached)
        postMessage({ type: 'status', status: 'ready' })
        return
      }

      case 'download': {
        const bytes = await fetchModel()
        await writeCache(bytes)
        session = await ORT.InferenceSession.create(bytes.buffer)
        postMessage({ type: 'status', status: 'ready' })
        return
      }

      case 'infer': {
        if (!session) throw new Error('Model not loaded')
        const { id, tokens, eloSelf, eloOppo } = message
        // One position at a time. Maia's own site batches a position across all
        // 21 ratings in one pass; this panel only ever asks about the rating
        // that is selected, so the batch dimension is always 1.
        const output = await session.run({
          tokens: new ORT.Tensor('float32', new Float32Array(tokens), [1, 64, 12]),
          elo_self: new ORT.Tensor('float32', Float32Array.from([eloSelf]), [1]),
          elo_oppo: new ORT.Tensor('float32', Float32Array.from([eloOppo]), [1]),
        })
        const policy = new Float32Array(output.logits_move.data)
        const value = new Float32Array(output.logits_value.data)
        postMessage({ type: 'result', id, policy: policy.buffer, value: value.buffer }, [
          policy.buffer,
          value.buffer,
        ])
        return
      }
    }
  } catch (error) {
    postMessage({ type: 'error', id: message.id, message: String(error?.message ?? error) })
  }
}
