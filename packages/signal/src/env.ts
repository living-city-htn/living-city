/**
 * Every knob the signal layer reads from the environment, in one place -
 * the same shape as `packages/pipeline/src/env.ts`, for the same reason:
 * tuning at the venue should be one file and one redeploy.
 *
 * The first entry is the one that matters. `SIGNAL_LAYER` is off unless it is
 * explicitly turned on, and while it is off nothing below is read, no index is
 * touched, no embedding is generated and no agent runs. Moments 1 to 8 of the
 * demo script are byte-identical with the flag off, which is the whole point of
 * it existing (integration/tasks/T2).
 */

const str = (name: string, fallback: string) => process.env[name] ?? fallback

const num = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/** `on`, `1` and `true` all mean on. Everything else, including unset, is off. */
const flag = (name: string) => {
  const raw = (process.env[name] ?? '').trim().toLowerCase()
  return raw === 'on' || raw === '1' || raw === 'true'
}

export const env = {
  /** The one switch. Everything in this package checks it first. */
  enabled: () => flag('SIGNAL_LAYER'),

  // ---- Elasticsearch -----------------------------------------------------

  /** No trailing slash. Empty means "no cluster", which is a fallback, not an error. */
  elasticUrl: () => str('ELASTIC_URL', '').replace(/\/$/, ''),
  elasticApiKey: () => process.env.ELASTIC_API_KEY ?? '',
  /** Overridable so a second demo machine can point at its own index. */
  indexName: () => str('SIGNAL_INDEX', 'posts-signal'),

  /**
   * Short on purpose. Every call site has a Postgres/store fallback, so a slow
   * cluster must lose the race quickly rather than hold a civic page request
   * open. docs/04 wants the government page to answer in 15 seconds, and this
   * budget is a small slice of that.
   */
  requestTimeoutMs: () => num('SIGNAL_TIMEOUT_MS', 4_000),
  /** How long a health verdict is trusted before it is re-checked. */
  healthTtlMs: () => num('SIGNAL_HEALTH_TTL_MS', 10_000),

  // ---- Embeddings --------------------------------------------------------

  /**
   * The same vendor the pipeline already calls (`AI_PROVIDER=openai`,
   * integration/EVENT-FACTS.md decision 3), so this is not a second provider.
   * Absent key means no vectors, which degrades retrieval to BM25 only rather
   * than failing it.
   */
  openaiApiKey: () => process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: () => str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  embeddingModel: () => str('SIGNAL_EMBED_MODEL', 'text-embedding-3-small'),
  /** Must match the mapping. Changing it means reindexing, not redeploying. */
  embeddingDims: () => num('SIGNAL_EMBED_DIMS', 1536),

  // ---- The agent ---------------------------------------------------------

  agentModel: () => str('SIGNAL_AGENT_MODEL', 'gpt-4.1-mini'),
  /** Hard cap. The 6th run inside a rolling minute is refused, not queued. */
  callsPerMinute: () => num('SIGNAL_AGENT_CALLS_PER_MINUTE', 6),
  /** Dollars. Crossing it disables the agent for the process's lifetime. */
  spendCeilingUsd: () => num('SIGNAL_AGENT_SPEND_CEILING_USD', 2),
  /** Below this incident confidence the agent may only suggest. docs/07 section 7. */
  confidenceFloor: () => num('SIGNAL_CONFIDENCE_FLOOR', 55),
  agentTimeoutMs: () => num('SIGNAL_AGENT_TIMEOUT_MS', 25_000),
} as const
