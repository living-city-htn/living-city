import { env } from '../env'
import { geminiProvider } from './gemini'
import type { ModelProvider } from './types'

export * from './types'
export { geminiProvider }

let provider: ModelProvider | null = null

/**
 * The one provider this weekend. A second one is docs/04 Stage 4 item 7 and
 * not before: an untested fallback is not a fallback. The stage-time fuse for
 * an outage is the operator's preset plan button, not a second vendor.
 */
export const getProvider = (): ModelProvider => (provider ??= geminiProvider())

/** Tests inject a fake here. */
export const setProvider = (next: ModelProvider | null): void => { provider = next }

/**
 * Concurrency guard. docs/04 Stage 3: ten judges posting at once must queue
 * inside the handler rather than fail, because Call A runs inline in the post
 * handler and Vercel has no worker to drain a queue.
 *
 * Module-scoped, so it bounds one serverless instance rather than the whole
 * deployment. That is the honest limit of doing this without a queue, and it
 * is enough for a demo: instances are few and the per-user rate limit (Civic)
 * is the real throttle.
 */
class Semaphore {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((release) => this.waiting.push(release))
    }
    this.active++
    try {
      return await work()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

let callAGate: Semaphore | null = null

export const withCallAConcurrency = <T>(work: () => Promise<T>): Promise<T> =>
  (callAGate ??= new Semaphore(Math.max(1, env.callAConcurrency()))).run(work)

/**
 * At most one Call B in flight, process-wide. docs/02 section 4.4 wants a lock
 * row in the database for the real thing; this is the in-process half of it so
 * the tick route cannot overlap itself before the migrations land.
 */
let callBChain: Promise<unknown> = Promise.resolve()

export const withCallBLock = <T>(work: () => Promise<T>): Promise<T> => {
  const next = callBChain.then(work, work)
  callBChain = next.catch(() => undefined)
  return next
}
