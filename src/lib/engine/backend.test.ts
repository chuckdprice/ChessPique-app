import { afterEach, describe, expect, it } from 'vitest'
import {
  canUseThreads,
  defaultWorkerPath,
  ENGINE_WORKER_PATH,
  ISOLATED_WORKER_PATH,
} from './uci'

/**
 * Which build the app reaches for, and why.
 *
 * `crossOriginIsolated` is a read-only property of the global in a browser, so
 * these tests define it — which is fine here because Node does not have one at
 * all, and the app's whole question is "does this page have it and is it true".
 */
const setIsolated = (value: boolean | undefined) => {
  if (value === undefined) {
    delete (globalThis as { crossOriginIsolated?: unknown }).crossOriginIsolated
    return
  }
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => setIsolated(undefined))

describe('canUseThreads', () => {
  it('is true only on a cross-origin isolated page', () => {
    setIsolated(true)
    expect(canUseThreads()).toBe(true)
  })

  it('is false when the page is not isolated', () => {
    setIsolated(false)
    expect(canUseThreads()).toBe(false)
  })

  it('is false where the property does not exist at all', () => {
    // Node, and any browser old enough not to know the property. Treating
    // "unknown" as "no threads" is the safe direction: the single-threaded
    // build runs everywhere, and the threaded one cannot run without SAB.
    setIsolated(undefined)
    expect(canUseThreads()).toBe(false)
  })
})

describe('defaultWorkerPath', () => {
  it('takes the threaded build when the page can use threads', () => {
    setIsolated(true)
    expect(defaultWorkerPath()).toBe(ISOLATED_WORKER_PATH)
  })

  it('takes the single-threaded build otherwise', () => {
    setIsolated(false)
    expect(defaultWorkerPath()).toBe(ENGINE_WORKER_PATH)
  })

  it('takes the single-threaded build in Node, where the tests run', () => {
    setIsolated(undefined)
    expect(defaultWorkerPath()).toBe(ENGINE_WORKER_PATH)
  })
})

describe('the two paths', () => {
  it('are different files, and both under /stockfish', () => {
    expect(ISOLATED_WORKER_PATH).not.toBe(ENGINE_WORKER_PATH)
    for (const path of [ISOLATED_WORKER_PATH, ENGINE_WORKER_PATH]) {
      expect(path).toMatch(/^\/stockfish\/[\w.-]+\.js$/)
    }
  })

  it('names the worker the copy script leaves in place, not a copied build', () => {
    // sf-worker.js is source and is the one file under public/stockfish that
    // git tracks; everything else there is copied out of node_modules by
    // postinstall. Renaming it means updating .gitignore's negation too.
    expect(ISOLATED_WORKER_PATH).toBe('/stockfish/sf-worker.js')
  })
})

describe('the review is not user-configurable', () => {
  it('pins its thread count to a constant', async () => {
    // The whole reason there is a constant: PLAYED_LIKE_A/B were fitted against
    // one set of search limits, and threads move the evaluations enough to move
    // the estimate. A slider here would be a rating the reader could drag.
    const { REVIEW_THREADS } = await import('./analysis')
    expect(REVIEW_THREADS).toBe(1)
  })

  it('keeps it at 1 until the curve is re-fitted', async () => {
    // Slice 4 of BUILD-PLAN-v3.1.md. Raising this before re-calibrating buys
    // accuracy against the engine and loses it against the calibration, so the
    // two have to move in the same commit — and this test is the reminder.
    const { REVIEW_THREADS, REVIEW_DEPTH, REVIEW_MOVETIME_CAP_MS } = await import('./analysis')
    expect([REVIEW_THREADS, REVIEW_DEPTH, REVIEW_MOVETIME_CAP_MS]).toEqual([1, 20, 2500])
  })
})
