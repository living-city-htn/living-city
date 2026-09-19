/**
 * Embeddings, server-side, at write time.
 *
 * `text-embedding-3-small` at 1536 dimensions through the same vendor the
 * pipeline already calls (`AI_PROVIDER=openai`, integration/EVENT-FACTS.md
 * decision 3), so this is not a second provider. Raw `fetch` for the same
 * reason `packages/pipeline/src/provider/openai.ts` uses it.
 *
 * The contract every caller relies on: this never throws, and `null` is an
 * ordinary answer. No key, a refused request, a timeout, a malformed response
 * - all of them return `null`, the document is indexed without a vector, and
 * retrieval degrades to BM25 only and says so in its response metadata. An
 * embedding is an enhancement to search, never a precondition for a post
 * succeeding.
 */
import { env } from './env'
import { log } from './log'

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>
}

export const embeddingsAvailable = (): boolean =>
  env.enabled() && env.openaiApiKey().length > 0

/** One vector, or null. Never throws. */
export const embed = async (text: string): Promise<number[] | null> => {
  const batch = await embedMany([text])
  return batch[0] ?? null
}

/**
 * Many vectors in one request, answered in input order. The backfill uses this;
 * the ingest path calls `embed` for its single document.
 *
 * A partial answer is not patched up: if the API returns fewer vectors than
 * were asked for, the missing slots stay null and those documents are indexed
 * without a vector. Guessing which input a vector belongs to is how a search
 * index quietly starts lying.
 */
export const embedMany = async (texts: string[]): Promise<Array<number[] | null>> => {
  const empty = texts.map(() => null)
  if (!embeddingsAvailable() || texts.length === 0) return empty

  const usable = texts.map((t) => t.trim()).filter((t) => t.length > 0)
  if (usable.length !== texts.length) return empty

  try {
    const response = await fetch(`${env.openaiBaseUrl()}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.openaiApiKey()}`,
      },
      body: JSON.stringify({
        model: env.embeddingModel(),
        input: texts,
        dimensions: env.embeddingDims(),
      }),
      signal: AbortSignal.timeout(env.requestTimeoutMs()),
    })

    if (!response.ok) {
      log.warn('embed.failed', { status: response.status, body: (await response.text()).slice(0, 200) })
      return empty
    }

    const body = (await response.json()) as EmbeddingResponse
    const vectors = body.data ?? []
    if (vectors.length !== texts.length) {
      log.warn('embed.length_mismatch', { asked: texts.length, got: vectors.length })
      return empty
    }

    return vectors.map((entry) => {
      const vector = entry.embedding
      if (!Array.isArray(vector) || vector.length !== env.embeddingDims()) return null
      return vector
    })
  } catch (error) {
    // A timeout here must cost the post nothing: the caller indexes without a
    // vector and the document is still fully searchable by BM25.
    log.warn('embed.error', { reason: error instanceof Error ? error.message : String(error) })
    return empty
  }
}
