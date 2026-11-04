import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOOT_FAILED_PREFIX,
  canUseThreads,
  defaultWorkerPath,
  Engine,
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
      expect(path).toMatch(/^\/stockfish\/[\w.-]+\.js(\?v=\d+)?$/)
    }
  })

  it('does not load the fallback from the URL browsers hold a header-less copy of', () => {
    // Only reachable on a browser that ran the app before v3.1 and whose threaded
    // build then failed, so nothing else here would ever notice it going back.
    expect(ENGINE_WORKER_PATH).not.toBe('/stockfish/stockfish-19-lite-single.js')
    expect(new URL(ENGINE_WORKER_PATH, 'https://x').pathname).toBe(
      '/stockfish/stockfish-19-lite-single.js',
    )
  })

  it('names the worker the copy script leaves in place, not a copied build', () => {
    // sf-worker.js is source and is the one file under public/stockfish that
    // git tracks; everything else there is copied out of node_modules by
    // postinstall. Renaming it means updating .gitignore's negation too.
    expect(ISOLATED_WORKER_PATH).toBe('/stockfish/sf-worker.js')
  })
})

describe('falling back when the threaded build will not start', () => {
  /**
   * A worker that answers the protocol, unless told how this path should fail.
   * Answers arrive as microtasks, so a test on fake timers that never advances
   * them can only pass if nothing along the way needed a timer to fire.
   */
  interface Threaded {
    onerror: ((e: { message: string }) => void) | null
    say: (line: string) => void
  }
  const stubWorkers = (threaded: (worker: Threaded) => void) => {
    const started: string[] = []
    class FakeWorker {
      onmessage: ((e: { data: string }) => void) | null = null
      onerror: ((e: { message: string }) => void) | null = null
      constructor(private path: string) {
        started.push(path)
      }
      say(line: string) {
        queueMicrotask(() => this.onmessage?.({ data: line }))
      }
      postMessage(command: string) {
        if (this.path === ISOLATED_WORKER_PATH && command === 'uci') return threaded(this)
        if (command === 'uci') this.say('uciok')
        if (command === 'isready') this.say('readyok')
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    return started
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not wait when the worker script fails to load', async () => {
    vi.useFakeTimers()
    const started = stubWorkers((w) => queueMicrotask(() => w.onerror?.({ message: '' })))
    const engine = new Engine(ISOLATED_WORKER_PATH)
    await engine.init()
    expect(started).toEqual([ISOLATED_WORKER_PATH, ENGINE_WORKER_PATH])
    expect(engine.activeWorkerPath).toBe(ENGINE_WORKER_PATH)
  })

  it('does not wait when the engine inside the worker says it failed', async () => {
    // The commoner case, and one `onerror` cannot hear: the engine and its net
    // load inside a promise, so the worker script itself ran without a fault.
    vi.useFakeTimers()
    stubWorkers((w) => w.say(`${BOOT_FAILED_PREFIX}: net nn-x failed (404)`))
    const engine = new Engine(ISOLATED_WORKER_PATH)
    await engine.init()
    expect(engine.activeWorkerPath).toBe(ENGINE_WORKER_PATH)
  })

  it('does not take an ordinary engine error for a failure to start', async () => {
    vi.useFakeTimers()
    stubWorkers((w) => {
      w.say('info string error something survivable')
      w.say('uciok')
    })
    const engine = new Engine(ISOLATED_WORKER_PATH)
    await engine.init()
    expect(engine.activeWorkerPath).toBe(ISOLATED_WORKER_PATH)
  })

  it('still gives a worker that goes quiet the whole timeout', async () => {
    // A cold start can legitimately spend a while downloading its net, so
    // silence alone is not a failure until the time is up.
    vi.useFakeTimers()
    const started = stubWorkers(() => {})
    const engine = new Engine(ISOLATED_WORKER_PATH)
    const init = engine.init()
    await vi.advanceTimersByTimeAsync(44_000)
    expect(started).toEqual([ISOLATED_WORKER_PATH])
    await vi.advanceTimersByTimeAsync(1_000)
    await init
    expect(engine.activeWorkerPath).toBe(ENGINE_WORKER_PATH)
  })

  it('reports a failure when the fallback will not start either', async () => {
    vi.useFakeTimers()
    class Broken {
      onerror: ((e: { message: string }) => void) | null = null
      postMessage() {
        queueMicrotask(() => this.onerror?.({ message: 'no engine' }))
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', Broken)
    await expect(new Engine(ISOLATED_WORKER_PATH).init()).rejects.toThrow('no engine')
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
