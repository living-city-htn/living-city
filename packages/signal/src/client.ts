/**
 * The Elasticsearch transport, and the one function every other file in this
 * package calls before it does anything: `isAvailable()`.
 *
 * Written against `fetch` rather than `@elastic/elasticsearch`, for the reason
 * `packages/pipeline/src/provider/openai.ts` gives for doing the same to the
 * OpenAI SDK: the surface used here is a handful of JSON endpoints, and a
 * hackathon does not need a dependency install standing between the team and a
 * working cluster. This package adds no dependencies at all.
 *
 * The rule this file exists to enforce is that Elasticsearch is never load
 * bearing. `SIGNAL_LAYER` off, `ELASTIC_URL` unset, a cluster that is down, a
 * cluster that is merely slow, a query that throws - all of them are the same
 * answer, `degraded`, and every caller has a store-backed fallback for it.
 * Nothing here throws at the caller.
 */
import { env } from './env'
import { log } from './log'

export class ElasticError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message)
    this.name = 'ElasticError'
  }
}

const headers = (): Record<string, string> => {
  const out: Record<string, string> = { 'content-type': 'application/json' }
  const apiKey = env.elasticApiKey()
  if (apiKey) out.authorization = `ApiKey ${apiKey}`
  return out
}

const request = async <T>(
  method: string,
  path: string,
  body?: unknown,
  contentType?: string,
): Promise<T> => {
  const url = `${env.elasticUrl()}${path}`
  const init: RequestInit = {
    method,
    headers: contentType ? { ...headers(), 'content-type': contentType } : headers(),
    // One timeout for every call. Every call site has a fallback, so a slow
    // cluster must lose the race quickly rather than hold a civic page open.
    signal: AbortSignal.timeout(env.requestTimeoutMs()),
  }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new ElasticError(
      `${method} ${path} -> ${response.status}`,
      response.status,
      text.slice(0, 500),
    )
  }
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * The slice of the Elasticsearch API this package uses. Small on purpose: if it
 * grows much past this, that is the signal to reconsider the SDK.
 */
export type Es = {
  ping(): Promise<void>
  indexExists(index: string): Promise<boolean>
  createIndex(index: string, body: unknown): Promise<void>
  putDoc(index: string, id: string, doc: unknown): Promise<void>
  deleteDoc(index: string, id: string): Promise<void>
  bulk(index: string, ndjson: string): Promise<{ errors: boolean; items: unknown[] }>
  search<T>(index: string, body: unknown): Promise<T>
  /** ES|QL, through `_query`. Returns the raw envelope; callers name columns. */
  esql(query: string): Promise<EsqlResult>
  refresh(index: string): Promise<void>
}

export type EsqlResult = {
  columns: Array<{ name: string; type: string }>
  values: unknown[][]
}

const es: Es = {
  ping: async () => {
    await request('GET', '/')
  },

  indexExists: async (index) => {
    try {
      await request('HEAD', `/${encodeURIComponent(index)}`)
      return true
    } catch (error) {
      if (error instanceof ElasticError && error.status === 404) return false
      throw error
    }
  },

  createIndex: async (index, body) => {
    await request('PUT', `/${encodeURIComponent(index)}`, body)
  },

  putDoc: async (index, id, doc) => {
    await request('PUT', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, doc)
  },

  deleteDoc: async (index, id) => {
    try {
      await request('DELETE', `/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`)
    } catch (error) {
      // Deleting a document that was never indexed is success, not failure: the
      // post is absent from the index either way, which is all the hide-post
      // path promises.
      if (error instanceof ElasticError && error.status === 404) return
      throw error
    }
  },

  bulk: async (index, ndjson) =>
    request('POST', `/${encodeURIComponent(index)}/_bulk`, ndjson, 'application/x-ndjson'),

  search: async <T>(index: string, body: unknown) =>
    request<T>('POST', `/${encodeURIComponent(index)}/_search`, body),

  esql: async (query) => request<EsqlResult>('POST', '/_query', { query }),

  refresh: async (index) => {
    await request('POST', `/${encodeURIComponent(index)}/_refresh`)
  },
}

/** Null when the layer is off or unconfigured. Most callers want `withElastic`. */
export const getClient = (): Es | null => {
  if (!env.enabled()) return null
  if (!env.elasticUrl()) return null
  return es
}

type Health = { ok: boolean; at: number; reason: string }

let health: Health | null = null

/** Tests and the operator's reset path clear the cached verdict. */
export const resetHealth = (): void => {
  health = null
}

/**
 * True when there is a cluster that answered inside the timeout.
 *
 * The verdict is cached for `SIGNAL_HEALTH_TTL_MS` so a civic page painting
 * four panels does not ping the cluster four times, and a dead cluster costs
 * one timeout per ten seconds rather than one per request.
 *
 * Never throws. A caller can write
 * `if (!(await isAvailable())) return fromStore()` and be certain that is the
 * whole error handling story.
 */
export const isAvailable = async (): Promise<boolean> => {
  const client = getClient()
  if (!client) return false

  const now = Date.now()
  if (health && now - health.at < env.healthTtlMs()) return health.ok

  try {
    await client.ping()
    health = { ok: true, at: now, reason: 'ok' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // Logged once per TTL rather than once per request, on purpose.
    log.warn('elastic.unavailable', { reason })
    health = { ok: false, at: now, reason }
  }
  return health.ok
}

/** Why the last health check said what it said. Surfaced as response metadata. */
export const healthReason = (): string => {
  if (!env.enabled()) return 'SIGNAL_LAYER is off'
  if (!env.elasticUrl()) return 'ELASTIC_URL is not set'
  return health?.reason ?? 'not checked yet'
}

/**
 * Run `work` against the cluster, or fall back to the store. Every read path in
 * this package uses this shape, so "what happens when Elasticsearch dies" has
 * exactly one answer and it is written down once.
 */
export const withElastic = async <T>(
  label: string,
  work: (client: Es) => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<{ value: T; degraded: boolean; reason: string | null }> => {
  const client = getClient()
  if (!client || !(await isAvailable())) {
    return { value: await fallback(), degraded: true, reason: healthReason() }
  }
  try {
    return { value: await work(client), degraded: false, reason: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log.warn('elastic.query_failed', { label, reason })
    // One bad query does not prove a dead cluster, so the health verdict is
    // left alone: this request degrades and the next one tries again.
    return { value: await fallback(), degraded: true, reason }
  }
}
