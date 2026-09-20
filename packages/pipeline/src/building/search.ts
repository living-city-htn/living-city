import { log } from '../log'
import { env } from '../env'
import bundled from '../../../fixtures/data/building/search.mock.json'

/**
 * The reference lookup, for when the photo and the caption are not enough.
 *
 * WHY THIS IS NOT A TOOL CALL. The obvious build is to hand the model a search
 * tool and let it loop. This does not, for three reasons that matter more here
 * than the elegance does:
 *
 *   1. `ModelProvider` (provider/types.ts) is one shot: system, payload,
 *      schema, answer. Tool calling would put a loop inside the seam that every
 *      other call would then have to reason about.
 *   2. A loop the model controls has no bounded cost. This has exactly one
 *      search, decided by one boolean, spent or not spent.
 *   3. It keeps the architecture rule intact. The model decides *that* a search
 *      is needed and *what* to ask; deterministic code decides whether to run
 *      it, runs it, and owns the result. AI still ends at JSON.
 *
 * Degradation is the normal case, not the error case. No key, no network, a
 * slow endpoint or a junk response all mean the same thing: the first-pass spec
 * stands and the building is built from what the user gave us. Nothing here
 * can fail a request.
 */

export type SearchResult = {
  title: string
  url: string
  /** A short extract. Trimmed hard: this goes into a prompt. */
  snippet: string
}

export interface SearchProvider {
  readonly name: string
  available(): boolean
  search(query: string): Promise<SearchResult[]>
}

/** Enough to ground a description, few enough to keep the second prompt small. */
const MAX_RESULTS = 4
const MAX_SNIPPET = 400

const clean = (raw: unknown): SearchResult[] => {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): SearchResult[] => {
    if (item === null || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const title = typeof row.title === 'string' ? row.title : ''
    const url = typeof row.url === 'string' ? row.url : ''
    const snippet = typeof row.content === 'string'
      ? row.content
      : typeof row.snippet === 'string' ? row.snippet : ''
    if (!title || !url) return []
    return [{ title, url, snippet: snippet.slice(0, MAX_SNIPPET) }]
  }).slice(0, MAX_RESULTS)
}

/**
 * The canned answers, for a venue with no network. Same shape and same code
 * path as the live provider, and bundled rather than read off disk for the
 * reason `voice/fixture.ts` explains at length: a serverless bundle's working
 * directory is not the repo root.
 */
export const fixtureSearchProvider = (): SearchProvider => ({
  name: 'search-fixture',
  available: () => true,
  async search(query: string): Promise<SearchResult[]> {
    const table = bundled as Record<string, unknown>
    const key = query.toLowerCase()
    const hit = Object.keys(table).find((k) => key.includes(k.toLowerCase()))
    return clean(table[hit ?? 'default'])
  },
})

/**
 * A plain JSON search endpoint. Deliberately not a vendor SDK: the request is
 * one POST and the response is read defensively, so pointing
 * `BUILDING_SEARCH_URL` at a different service is a config change rather than
 * a code change. This is not a second model provider (AGENTS.md); no model
 * runs here.
 */
export const httpSearchProvider = (): SearchProvider => ({
  name: 'search-http',

  available: () => env.searchApiKey().length > 0,

  async search(query: string): Promise<SearchResult[]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), env.searchTimeoutMs())
    try {
      const response = await fetch(env.searchUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.searchApiKey()}`,
        },
        body: JSON.stringify({
          query,
          max_results: MAX_RESULTS,
          search_depth: 'basic',
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        log.warn('building.search_failed', { status: response.status })
        return []
      }
      const body = await response.json() as { results?: unknown }
      return clean(body.results)
    } catch (e) {
      log.warn('building.search_error', {
        message: e instanceof Error ? e.message : String(e),
      })
      return []
    } finally {
      clearTimeout(timer)
    }
  },
})

/**
 * Fixtures first when the flag is on and no key is set, so a rehearsal runs the
 * shipping code path rather than a parallel one. The flag cannot shadow a real
 * search, for the same reason `VOICE_FIXTURES` cannot shadow a real OMNI call.
 */
export const getSearchProvider = (): SearchProvider =>
  (env.searchFixtures() ? fixtureSearchProvider() : httpSearchProvider())
