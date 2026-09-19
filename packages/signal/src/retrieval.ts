/**
 * Hybrid retrieval: "what is the recent evidence about this block?"
 *
 * Two rankers over the same index, fused:
 *
 *   BM25   a `multi_match` over `text` and `summary`, with `summary` boosted
 *          slightly. Lexical, exact, and the only half that works when there
 *          are no vectors.
 *   kNN    cosine over `embedding`, which is `summary` plus the post text
 *          embedded at write time. Catches the resident who wrote "the whole
 *          street is a lake" when staff searched for "flooding".
 *
 * Fused with Reciprocal Rank Fusion rather than a weighted score sum, because
 * BM25 scores and cosine similarities are not on comparable scales and any
 * fixed weighting between them is a number nobody can defend. RRF only reads
 * the ranks: a document at rank 1 in either list contributes 1/(60+1),
 * regardless of whether its BM25 score was 12.4 or 0.9.
 *
 * Run as two queries fused here rather than through the `rrf` retriever added
 * in recent 8.x, so this works against whatever cluster is available on the
 * day, including an older one - and so the fusion is inspectable in the
 * response, which is what lets the civic page show why a post was retrieved.
 *
 * Degradation, in order:
 *   no embeddings configured  -> BM25 only, `mode: "bm25_only"`
 *   Elasticsearch unavailable -> the store fallback, `mode: "fallback"`
 *   no store port wired       -> empty, and the metadata says why
 *
 * No coordinates ever leave this module. Geo filtering happens inside the
 * query; hits carry block ids.
 */
import { withElastic, type Es } from './client'
import { embed, embeddingsAvailable } from './embed'
import { env } from './env'
import { civicRead, type EvidenceRecord } from './ports'
import { authenticityOf, summarise } from './doc'

/** The RRF constant. 60 is the value from the original paper and the one
 *  Elasticsearch itself defaults to; it damps the influence of top ranks just
 *  enough that one ranker cannot dominate the other. */
const RRF_K = 60

export type EvidenceHit = {
  post_id: string
  community_id: string
  created_at: string
  text: string
  summary: string
  tags: string[]
  confidence: number
  authenticity: number
  incident_type: string
  incident_severity: number
  incident_evidence: string
  /** The fused RRF score. Not comparable across queries, only within one. */
  score: number
  /** Which ranker found it and where, so the civic page can show its working. */
  ranks: { bm25: number | null; knn: number | null }
}

export type SearchMode = 'hybrid' | 'bm25_only' | 'fallback' | 'unavailable'

export type SearchEvidenceParams = {
  blockId?: string
  query?: string
  /** `1h`, `24h`, `7d`. Anything else is ignored and the window is unbounded. */
  window?: string
  k?: number
}

export type SearchEvidenceResult = {
  hits: EvidenceHit[]
  metadata: {
    mode: SearchMode
    degraded: boolean
    /** Present whenever `mode` is not `hybrid`. Always says why in plain words. */
    reason: string | null
    took_ms: number
    total_considered: number
  }
}

const WINDOW = /^(\d+)([hdm])$/

/** `24h` -> an ISO timestamp 24 hours ago. Null when the window is unparseable
 *  or absent, which means "no lower bound". */
export const windowStart = (window: string | undefined, now = Date.now()): string | null => {
  if (!window) return null
  const match = WINDOW.exec(window.trim())
  if (!match) return null
  const amount = Number(match[1])
  const unit = match[2]
  const ms = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return new Date(now - amount * ms).toISOString()
}

type Source = Record<string, unknown>
type SearchResponse = { hits?: { hits?: Array<{ _id: string; _score?: number; _source?: Source }> } }

const filters = (params: SearchEvidenceParams): unknown[] => {
  const out: unknown[] = []
  if (params.blockId) out.push({ term: { community_id: params.blockId } })
  const since = windowStart(params.window)
  if (since) out.push({ range: { created_at: { gte: since } } })
  return out
}

const toHit = (source: Source, ranks: EvidenceHit['ranks'], score: number): EvidenceHit => ({
  post_id: String(source.post_id ?? ''),
  community_id: String(source.community_id ?? ''),
  created_at: String(source.created_at ?? ''),
  text: String(source.text ?? ''),
  summary: String(source.summary ?? ''),
  tags: Array.isArray(source.tags) ? (source.tags as string[]) : [],
  confidence: Number(source.confidence ?? 0),
  authenticity: Number(source.authenticity ?? 0),
  incident_type: String(source.incident_type ?? 'none'),
  incident_severity: Number(source.incident_severity ?? 0),
  incident_evidence: String(source.incident_evidence ?? 'none'),
  score,
  ranks,
})

/** Records -> hits, for the store fallback. Ordered newest first, because
 *  without an index there is no relevance to order by and pretending otherwise
 *  would be a worse answer than an honest recency list. */
const fromRecords = (records: EvidenceRecord[], k: number): EvidenceHit[] =>
  [...records]
    .sort((a, b) => b.post.created_at.localeCompare(a.post.created_at))
    .slice(0, k)
    .map((record) => ({
      post_id: record.post.id,
      community_id: record.post.community_id,
      created_at: record.post.created_at,
      text: record.post.text,
      summary: summarise(record.analysis),
      tags: record.analysis.tags,
      confidence: record.analysis.confidence,
      authenticity: authenticityOf(record.analysis),
      incident_type: record.analysis.incident.type,
      incident_severity: record.analysis.incident.severity,
      incident_evidence: record.analysis.incident.evidence,
      score: 0,
      ranks: { bm25: null, knn: null },
    }))

const fallbackSearch = (params: SearchEvidenceParams, k: number): EvidenceHit[] => {
  const port = civicRead()
  if (!port) return []
  const since = windowStart(params.window)
  const records = port.listEvidence({
    blockId: params.blockId,
    since: since ?? undefined,
    limit: k * 4,
  })

  // A text query still filters, just lexically and without ranking. Better than
  // ignoring the query and returning the wrong posts confidently.
  const needle = params.query?.trim().toLowerCase()
  const filtered = needle
    ? records.filter((r) =>
        r.post.text.toLowerCase().includes(needle)
        || summarise(r.analysis).toLowerCase().includes(needle))
    : records

  return fromRecords(filtered, k)
}

const runBm25 = async (
  client: Es, params: SearchEvidenceParams, size: number,
): Promise<Array<{ id: string; source: Source }>> => {
  const must = params.query
    ? [{
        multi_match: {
          query: params.query,
          // `summary` is boosted because it is the normalised civic vocabulary;
          // matching it is a stronger signal than matching one word of prose.
          fields: ['summary^1.5', 'text'],
        },
      }]
    : [{ match_all: {} }]

  const response = await client.search<SearchResponse>(env.indexName(), {
    size,
    query: { bool: { must, filter: filters(params) } },
    _source: { excludes: ['embedding', 'location'] },
  })
  return (response.hits?.hits ?? []).map((hit) => ({ id: hit._id, source: hit._source ?? {} }))
}

const runKnn = async (
  client: Es, params: SearchEvidenceParams, size: number, vector: number[],
): Promise<Array<{ id: string; source: Source }>> => {
  const response = await client.search<SearchResponse>(env.indexName(), {
    size,
    knn: {
      field: 'embedding',
      query_vector: vector,
      k: size,
      // Candidates per shard. Wider than k so recall does not collapse on a
      // filtered query; there is only one shard at this scale.
      num_candidates: Math.max(50, size * 10),
      filter: filters(params),
    },
    _source: { excludes: ['embedding', 'location'] },
  })
  return (response.hits?.hits ?? []).map((hit) => ({ id: hit._id, source: hit._source ?? {} }))
}

/**
 * Recent evidence about a block, ranked.
 *
 * Never throws. Always returns hits and metadata that says honestly how they
 * were found - which is what the civic page renders as "hybrid" versus
 * "keyword only, vectors unavailable".
 */
export const searchEvidence = async (
  params: SearchEvidenceParams,
): Promise<SearchEvidenceResult> => {
  const started = Date.now()
  const k = Math.max(1, Math.min(50, params.k ?? 10))
  // Each ranker looks deeper than k so that fusion has something to fuse: a
  // document ranked 11th by BM25 and 2nd by kNN should be able to reach the
  // final top 10.
  const depth = Math.min(100, k * 3)

  let mode: SearchMode = 'hybrid'
  let modeReason: string | null = null

  const vector = params.query && embeddingsAvailable() ? await embed(params.query) : null
  if (!vector) {
    mode = 'bm25_only'
    modeReason = !params.query
      ? 'no query text, so there is nothing to embed'
      : embeddingsAvailable()
        ? 'the embedding request failed; ranking is lexical only'
        : 'OPENAI_API_KEY is not set, so no query vector could be built'
  }

  const outcome = await withElastic(
    'search_evidence',
    async (client) => {
      const [bm25, knn] = await Promise.all([
        runBm25(client, params, depth),
        vector ? runKnn(client, params, depth, vector) : Promise.resolve([]),
      ])

      // RRF. Every document gets 1/(60+rank) from each list it appears in.
      const fused = new Map<string, { source: Source; score: number; ranks: EvidenceHit['ranks'] }>()
      const absorb = (list: Array<{ id: string; source: Source }>, which: 'bm25' | 'knn') => {
        list.forEach((entry, i) => {
          const rank = i + 1
          const existing = fused.get(entry.id)
          const contribution = 1 / (RRF_K + rank)
          if (existing) {
            existing.score += contribution
            existing.ranks[which] = rank
          } else {
            fused.set(entry.id, {
              source: entry.source,
              score: contribution,
              ranks: { bm25: which === 'bm25' ? rank : null, knn: which === 'knn' ? rank : null },
            })
          }
        })
      }
      absorb(bm25, 'bm25')
      absorb(knn, 'knn')

      const hits = [...fused.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((entry) => toHit(entry.source, entry.ranks, entry.score))

      return { hits, considered: fused.size }
    },
    () => ({ hits: fallbackSearch(params, k), considered: 0 }),
  )

  if (outcome.degraded) {
    mode = civicRead() ? 'fallback' : 'unavailable'
    modeReason = outcome.reason ?? modeReason
  }

  return {
    hits: outcome.value.hits,
    metadata: {
      mode,
      degraded: mode !== 'hybrid',
      reason: modeReason,
      took_ms: Date.now() - started,
      total_considered: outcome.value.considered,
    },
  }
}
