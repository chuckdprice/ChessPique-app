import type { ModelRunner } from './model'

/**
 * The browser side of the worker in `public/maia3/maia-worker.js`.
 *
 * Nothing in the app may depend on any of this working. Maia is an overlay:
 * if the model will not fetch, will not initialise, or the browser is offline,
 * every method here rejects and the panel goes back to being Stockfish alone.
 * The review, the classifications and the accuracies never call into it.
 */

export const MODEL_PATH = '/maia3/maia3_simplified.onnx'
/** Bumped only when the weights change; it is what evicts a stale cache. */
export const MODEL_VERSION = 'maia3-simplified-1'
/** What the download costs, for the UI to say so before starting it. */
export const MODEL_BYTES = 45_683_686

export type MaiaStatus =
  | 'idle'
  /** Not in this browser yet — enabling means a download. */
  | 'absent'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error'

interface SessionOptions {
  onStatus?: (status: MaiaStatus) => void
  onProgress?: (loaded: number, total: number) => void
}

interface Pending {
  resolve: (value: { policy: Float32Array; value: Float32Array }) => void
  reject: (error: Error) => void
}

export class MaiaSession implements ModelRunner {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 0
  private ready: Promise<void> | null = null
  private settleReady: { resolve: () => void; reject: (e: Error) => void } | null = null
  private status: MaiaStatus = 'idle'

  constructor(private options: SessionOptions = {}) {}

  private setStatus(status: MaiaStatus) {
    this.status = status
    this.options.onStatus?.(status)
  }

  private start() {
    this.worker = new Worker('/maia3/maia-worker.js')
    this.worker.onmessage = (event: MessageEvent) => {
      const message = event.data
      switch (message.type) {
        case 'status':
          if (message.status === 'absent') {
            // The bytes are not here yet, so ask for them. Enabling the feature
            // is the consent to download; there is no second prompt.
            this.setStatus('downloading')
            this.worker?.postMessage({ type: 'download' })
          } else if (message.status === 'ready') {
            this.setStatus('ready')
            this.settleReady?.resolve()
            this.settleReady = null
          }
          break
        case 'progress':
          this.options.onProgress?.(message.loaded, message.total)
          break
        case 'result': {
          const pending = this.pending.get(message.id)
          if (pending) {
            this.pending.delete(message.id)
            pending.resolve({
              policy: new Float32Array(message.policy),
              value: new Float32Array(message.value),
            })
          }
          break
        }
        case 'error':
          this.fail(new Error(message.message), message.id)
          break
      }
    }
    this.worker.onerror = () => this.fail(new Error('Maia worker failed to start'))
    this.setStatus('loading')
    this.worker.postMessage({ type: 'init', modelUrl: MODEL_PATH, version: MODEL_VERSION })
  }

  /**
   * An error with an id belongs to one inference; without one it is the model
   * itself, which takes the whole session down — a half-loaded model would
   * answer every later position with the same failure.
   */
  private fail(error: Error, id?: number) {
    if (id != null) {
      this.pending.get(id)?.reject(error)
      this.pending.delete(id)
      return
    }
    this.setStatus('error')
    this.settleReady?.reject(error)
    this.settleReady = null
    this.ready = null
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  /** Load the model, downloading it the first time. Safe to call repeatedly. */
  ensureReady(): Promise<void> {
    if (this.status === 'ready') return Promise.resolve()
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      this.settleReady = { resolve, reject }
      this.start()
    })
    return this.ready
  }

  async run(tokens: Float32Array, eloSelf: number, eloOppo: number) {
    await this.ensureReady()
    const id = this.nextId++
    return new Promise<{ policy: Float32Array; value: Float32Array }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      // The token buffer is transferred, so it must not be reused afterwards —
      // `encodePosition` builds a fresh one per call, which is what makes that safe.
      this.worker?.postMessage({ type: 'infer', id, tokens: tokens.buffer, eloSelf, eloOppo }, [
        tokens.buffer,
      ])
    })
  }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
    this.ready = null
    this.settleReady = null
    this.setStatus('idle')
  }
}
