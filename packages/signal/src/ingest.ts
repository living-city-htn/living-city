/**
 * Writing posts into the evidence index, and taking them out again.
 *
 * The single rule this module exists to keep: **a post must succeed when the
 * index write fails.** Every function here swallows its own errors and returns
 * a result object, and the ingest call in the post handler is not awaited.
 * There is no path from an Elasticsearch outage to a resident seeing an error,
 * and no model call between a post being created and the block rebuilding -
 * the embedding is generated inside this module's own fire-and-forget task,
 * off the request's critical path.
 */
import type { PostAnalysis } from '@living-city/contracts'
import { getClient, isAvailable } from './client'
import { buildDoc, docIdOf, embeddableText, type IndexableBlock, type IndexablePost } from './doc'
import { embed, embedMany, embeddingsAvailable } from './embed'
import { env } from './env'
import { ensureIndex } from './mapping'
import { log } from './log'

export type IngestResult = {
  ok: boolean
  indexed: boolean
  embedded: boolean
  reason: string | null
}

const skipped = (reason: string): IngestResult =>
  ({ ok: true, indexed: false, embedded: false, reason })

/**
 * `ensureIndex` runs once per process rather than once per post. A cold Vercel
 * instance pays one extra round trip on its first indexed post; every post
 * after that goes straight to the write.
 */
let indexReady: Promise<boolean> | null = null

export const resetIngestState = (): void => { indexReady = null }

const readyIndex = async (): Promise<boolean> => {
  const client = getClient()
  if (!client) return false
  indexReady ??= ensureIndex(client).then((result) => result.ok).catch(() => false)
  const ok = await indexReady
  // A failed ensure is not cached: the next post retries, so a cluster that
  // came up late does not stay unusable for the life of the process.
  if (!ok) indexReady = null
  return ok
}

/**
 * Index one post. Call this without awaiting from the post handler.
 *
 * A hidden post is never indexed - the index holds evidence staff may act on,
 * and a hidden post is one staff have already ruled out.
 */
export const indexPost = async (
  post: IndexablePost,
  analysis: PostAnalysis,
  options: { block?: IndexableBlock; engagement?: number } = {},
): Promise<IngestResult> => {
  if (!env.enabled()) return skipped('SIGNAL_LAYER is off')
  if (post.hidden) return skipped('post is hidden')

  try {
    if (!(await isAvailable())) return skipped('elasticsearch unavailable')
    if (!(await readyIndex())) return skipped('index not ready')

    const client = getClient()
    if (!client) return skipped('no client')

    const embedding = embeddingsAvailable() ? await embed(embeddableText(post, analysis)) : null
    const doc = buildDoc(post, analysis, { ...options, embedding })

    await client.putDoc(env.indexName(), docIdOf(post), doc)
    log.info('ingest.indexed', { post_id: post.id, embedded: embedding !== null })
    return { ok: true, indexed: true, embedded: embedding !== null, reason: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // Logged and swallowed. The post has already been created and answered.
    log.warn('ingest.failed', { post_id: post.id, reason })
    return { ok: false, indexed: false, embedded: false, reason }
  }
}

/**
 * Remove a post from the index, in the same request that hid it.
 *
 * Synchronous with the hide rather than fire-and-forget, because the promise
 * hide-post makes is that the post leaves every surface now. Still swallows
 * its error: a hide must succeed against a dead cluster, and the document is
 * then removed by the next backfill.
 */
export const removePost = async (postId: string): Promise<IngestResult> => {
  if (!env.enabled()) return skipped('SIGNAL_LAYER is off')

  try {
    if (!(await isAvailable())) return skipped('elasticsearch unavailable')
    const client = getClient()
    if (!client) return skipped('no client')

    await client.deleteDoc(env.indexName(), postId)
    log.info('ingest.removed', { post_id: postId })
    return { ok: true, indexed: false, embedded: false, reason: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log.warn('ingest.remove_failed', { post_id: postId, reason })
    return { ok: false, indexed: false, embedded: false, reason }
  }
}

export type BackfillRow = {
  post: IndexablePost
  analysis: PostAnalysis
  block?: IndexableBlock
  engagement?: number
}

export type BackfillResult = {
  ok: boolean
  considered: number
  indexed: number
  removed: number
  embedded: number
  failed: number
  reason: string | null
}

/**
 * Bring the index in line with the rows that already exist.
 *
 * Also the repair path for everything this layer swallows: a post whose index
 * write failed, and a hidden post whose delete failed, are both fixed by the
 * next run. Hidden rows are deleted rather than skipped, which is what makes
 * that true.
 *
 * Batched through `_bulk`, with embeddings requested one batch at a time so a
 * few hundred seed posts cost a handful of API calls rather than one each.
 */
export const backfill = async (
  rows: BackfillRow[],
  options: { batchSize?: number } = {},
): Promise<BackfillResult> => {
  const empty: BackfillResult = {
    ok: true, considered: rows.length, indexed: 0, removed: 0, embedded: 0, failed: 0, reason: null,
  }
  if (!env.enabled()) return { ...empty, ok: false, reason: 'SIGNAL_LAYER is off' }
  if (!(await isAvailable())) return { ...empty, ok: false, reason: 'elasticsearch unavailable' }
  if (!(await readyIndex())) return { ...empty, ok: false, reason: 'index not ready' }

  const client = getClient()
  if (!client) return { ...empty, ok: false, reason: 'no client' }

  const index = env.indexName()
  const batchSize = Math.max(1, options.batchSize ?? 50)
  const result = { ...empty }

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    const live = batch.filter((row) => !row.post.hidden)
    const gone = batch.filter((row) => row.post.hidden)

    const vectors = embeddingsAvailable()
      ? await embedMany(live.map((row) => embeddableText(row.post, row.analysis)))
      : live.map(() => null)

    const lines: string[] = []
    live.forEach((row, i) => {
      const embedding = vectors[i] ?? null
      if (embedding) result.embedded++
      lines.push(JSON.stringify({ index: { _id: docIdOf(row.post) } }))
      lines.push(JSON.stringify(buildDoc(row.post, row.analysis, {
        block: row.block, engagement: row.engagement, embedding,
      })))
    })
    for (const row of gone) {
      lines.push(JSON.stringify({ delete: { _id: docIdOf(row.post) } }))
    }
    if (lines.length === 0) continue

    try {
      const response = await client.bulk(index, `${lines.join('\n')}\n`)
      // `_bulk` answers 200 even when individual actions failed, so the item
      // list is the only honest source of a count here.
      let failed = 0
      for (const item of response.items ?? []) {
        const action = Object.values(item as Record<string, { status?: number }>)[0]
        const status = action?.status ?? 500
        // A delete of a document that was never indexed is success.
        if (status >= 400 && status !== 404) failed++
      }
      result.failed += failed
      result.indexed += live.length
      result.removed += gone.length
      if (failed > 0) log.warn('backfill.partial', { batch: start / batchSize, failed })
    } catch (error) {
      result.failed += batch.length
      result.reason = error instanceof Error ? error.message : String(error)
      log.warn('backfill.batch_failed', { batch: start / batchSize, reason: result.reason })
    }
  }

  try {
    await client.refresh(index)
  } catch {
    // A refresh failure only means the documents are visible a second later.
  }

  result.ok = result.failed === 0
  log.info('backfill.done', { ...result })
  return result
}
