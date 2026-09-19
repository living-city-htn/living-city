import type { AssetTaxonomy, PostAnalysis, PostInput } from '@living-city/contracts'
import { env } from '../env'
import { stableHash } from '../hash'
import { log } from '../log'
import { getProvider, withCallAConcurrency } from '../provider'
import { ModelError, type ImagePart } from '../provider/types'
import { loadTaxonomy } from '../taxonomy'
import { CALL_A_RETRY_REMINDER, callASystemPrompt } from './prompt'
import { postAnalysisBatchSchema } from './schema'
import { validatePostAnalysis, type ImageState } from './validate'

export * from './image'
export { validatePostAnalysis, type ImageState } from './validate'
export { callASystemPrompt } from './prompt'
export { postAnalysisSchema, postAnalysisBatchSchema } from './schema'

/**
 * Call A: one post in, one PostAnalysis out. docs/03 sections 2.2, 3.1, 4.1.
 *
 * This is the call that reads the judge's photo and caption on stage. It runs
 * inline in the post handler (docs/02 section 4.2) behind a concurrency guard,
 * because Vercel has no worker to drain a queue.
 */

export type CallARequest = {
  input: PostInput
  image?: ImagePart | null
  /** What happened to the image. Drives the image_only / image_missing flags. */
  imageState?: ImageState
}

export type CallAResult = {
  post_id: string
  analysis: PostAnalysis | null
  /** Every correction the validator made. Stored, and watched for regressions. */
  validator_log: string[]
  /**
   * True when the provider refused the content or the analysis came back
   * unsafe. docs/02 section 4.2: the post is hidden with reason "auto".
   */
  hide: boolean
  error?: string
  raw?: unknown
  meta?: { model: string; attempts: number; latency_ms: number; input_hash: string }
}

export type AnalyzeOptions = {
  taxonomy?: AssetTaxonomy
  /** docs/03 section 9 caps a batch at 20; an image-bearing post always goes alone. */
  batchSize?: number
}

const failed = (
  request: CallARequest, error: string, hide: boolean, validatorLog: string[] = [],
): CallAResult => ({
  post_id: request.input.post_id,
  analysis: null,
  validator_log: validatorLog,
  hide,
  error,
})

const runBatch = async (
  requests: CallARequest[],
  taxonomy: AssetTaxonomy,
): Promise<CallAResult[]> => {
  const payload = requests.map((r) => r.input)
  const images = requests
    .map((r) => r.image)
    .filter((i): i is ImagePart => !!i)
  const inputHash = stableHash({ payload, images: images.map((i) => i.data.length) })

  let response
  try {
    response = await withCallAConcurrency(() =>
      getProvider().complete({
        system: callASystemPrompt(taxonomy),
        payload,
        schema: postAnalysisBatchSchema,
        images,
        model: env.modelCallA(),
        maxOutputTokens: env.maxTokensCallA() * requests.length,
        retryReminder: CALL_A_RETRY_REMINDER,
      }),
    )
  } catch (error) {
    const refusal = error instanceof ModelError && error.kind === 'refusal'
    const message = error instanceof Error ? error.message : String(error)
    log.error('call_a.failed', { posts: requests.length, message, refusal })
    // A refusal is a verdict on the content: hide the post rather than let it
    // sit in the feed unanalysed. Any other failure leaves the post pending.
    return requests.map((r) => failed(r, message, refusal))
  }

  const array = Array.isArray(response.json) ? response.json : [response.json]
  if (array.length !== requests.length) {
    log.warn('call_a.length_mismatch', { sent: requests.length, got: array.length })
  }

  return requests.map((request, index) => {
    // Rule 21 promises input order, but match on post_id first so a reordered
    // response cannot silently attach the wrong analysis to a post.
    const byId = array.find(
      (item) =>
        item && typeof item === 'object'
        && (item as Record<string, unknown>).post_id === request.input.post_id,
    )
    const raw = byId ?? array[index]
    if (raw === undefined) {
      return failed(request, 'no analysis returned for this post', false)
    }

    const { analysis, log: validatorLog } = validatePostAnalysis(raw, {
      input: request.input,
      taxonomy,
      imageState: request.imageState ?? (request.image ? 'present' : 'none'),
    })

    if (validatorLog.length > 0) {
      log.warn('call_a.corrections', {
        post_id: request.input.post_id,
        count: validatorLog.length,
        corrections: validatorLog,
      })
    }

    return {
      post_id: request.input.post_id,
      analysis,
      validator_log: validatorLog,
      hide: analysis?.content_flags.includes('unsafe') ?? false,
      error: analysis ? undefined : 'analysis failed validation',
      raw,
      meta: {
        model: response.model,
        attempts: response.attempts,
        latency_ms: response.latencyMs,
        input_hash: inputHash,
      },
    }
  })
}

/**
 * Analyse many posts. Text-only posts are batched; a post with an image is
 * sent alone, because nothing in the payload tells the model which image
 * belongs to which post.
 */
export const analyzePosts = async (
  requests: CallARequest[],
  options: AnalyzeOptions = {},
): Promise<CallAResult[]> => {
  if (requests.length === 0) return []
  const taxonomy = options.taxonomy ?? loadTaxonomy()
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 10))

  const batches: CallARequest[][] = []
  let current: CallARequest[] = []
  for (const request of requests) {
    if (request.image) {
      batches.push([request])
      continue
    }
    current.push(request)
    if (current.length >= batchSize) {
      batches.push(current)
      current = []
    }
  }
  if (current.length > 0) batches.push(current)

  const results = await Promise.all(batches.map((batch) => runBatch(batch, taxonomy)))
  const byId = new Map<string, CallAResult>()
  for (const result of results.flat()) byId.set(result.post_id, result)

  return requests.map(
    (r) => byId.get(r.input.post_id) ?? failed(r, 'no result produced', false),
  )
}

/** The inline path used by POST /api/posts. */
export const analyzePost = async (
  request: CallARequest,
  options: AnalyzeOptions = {},
): Promise<CallAResult> => {
  const [result] = await analyzePosts([request], options)
  return result ?? failed(request, 'no result produced', false)
}

/**
 * Build a `PostInput` from a stored post. The AI never sees engagement counts,
 * author identity, or coordinates (docs/03 section 2.2) - coordinates are
 * Module 1's business and engagement is a weight the aggregator applies.
 */
export const toPostInput = (post: {
  id: string
  text: string
  image_caption?: string | null
  community_id: string | null
  is_incident_report?: boolean
  reported_incident_type?: PostInput['reported_incident_type']
  lang_hint?: string | null
}, context: {
  community_name: string | null
  time_context: PostInput['time_context']
  taxonomy_version: string
}): PostInput => ({
  post_id: post.id,
  text: post.text.slice(0, 1000),
  image_caption: post.image_caption ?? null,
  community_id: post.community_id,
  community_name: context.community_name,
  time_context: context.time_context,
  lang_hint: post.lang_hint ?? null,
  is_incident_report: post.is_incident_report ?? false,
  reported_incident_type: post.reported_incident_type ?? null,
  taxonomy_version: context.taxonomy_version,
})
