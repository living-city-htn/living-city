/**
 * `pnpm signal:backfill` from the repo root.
 *
 * Indexes the seeded corpus: every post in `posts.seed.json` paired with its
 * expected Call A output in `post-analysis.mock.json`. Hidden posts are deleted
 * from the index rather than skipped, which is what makes this the repair path
 * for a hide whose delete failed while the cluster was down.
 *
 * Why it reads the fixture files off disk rather than importing them: analyses
 * produced by a live pipeline live in `apps/web/lib/pipeline.ts` module memory
 * and a separate CLI process cannot see them, and `@living-city/fixtures` does
 * not export its `data/` directory. Backfilling the rows a running server holds
 * is `POST /api/civic/signal/backfill` instead.
 *
 * Safe to run repeatedly: the document id is the post id, so a second run
 * rewrites rather than duplicates.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postAnalysis, type PostAnalysis } from '@living-city/contracts'
import { communities, seedPosts } from '@living-city/fixtures'
import { backfill, ensureIndex, getClient, isAvailable, signalEnv, type BackfillRow } from '../src/index'

const here = dirname(fileURLToPath(import.meta.url))
const MOCK = join(here, '..', '..', 'fixtures', 'data', 'post-analysis.mock.json')

const loadAnalyses = (): Map<string, PostAnalysis> => {
  const raw = JSON.parse(readFileSync(MOCK, 'utf8')) as { analyses?: unknown[] }
  const out = new Map<string, PostAnalysis>()
  let rejected = 0

  for (const entry of raw.analyses ?? []) {
    const parsed = postAnalysis.safeParse(entry)
    // A fixture that does not satisfy the contract is skipped loudly rather
    // than indexed: a bad document here would poison retrieval quietly.
    if (!parsed.success) { rejected++; continue }
    out.set(parsed.data.post_id, parsed.data)
  }
  if (rejected > 0) console.warn(`Skipped ${rejected} analyses that failed contract validation.`)
  return out
}

const main = async () => {
  if (!signalEnv.enabled()) {
    console.log('SIGNAL_LAYER is off. Set SIGNAL_LAYER=on to backfill.')
    return
  }
  if (!signalEnv.elasticUrl()) {
    console.log('ELASTIC_URL is not set. Nothing to backfill into.')
    return
  }

  const client = getClient()
  if (!client || !(await isAvailable())) {
    console.error(`Cannot reach ${signalEnv.elasticUrl()}. Is the cluster up?`)
    process.exitCode = 1
    return
  }

  const ensured = await ensureIndex(client)
  if (!ensured.ok) {
    console.error(`Failed to create ${ensured.index}: ${ensured.reason}`)
    process.exitCode = 1
    return
  }

  const analyses = loadAnalyses()
  const geo = new Map(communities.map((c) => [c.community_id, c]))
  const rows: BackfillRow[] = []
  let unanalysed = 0

  for (const post of seedPosts) {
    const analysis = analyses.get(post.id)
    if (!analysis) { unanalysed++; continue }
    const block = geo.get(post.community_id)
    rows.push({
      post,
      analysis,
      block: block
        ? {
            official_area_id: block.source === 'synthetic' ? null : block.community_id,
            area_source: block.source,
            city_id: block.city_id,
          }
        : undefined,
    })
  }

  const result = await backfill(rows)
  console.log(
    `${result.indexed} indexed, ${result.removed} removed, ${result.embedded} embedded, `
    + `${result.failed} failed${unanalysed ? `, ${unanalysed} posts had no analysis` : ''}.`,
  )
  if (!result.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
