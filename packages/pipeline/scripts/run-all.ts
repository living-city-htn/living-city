/**
 * The whole pipeline, end to end, writing JSON files.
 *
 *   npm --workspace @living-city/pipeline run run:all
 *   npm --workspace @living-city/pipeline run run:all -- --offline
 *   npm --workspace @living-city/pipeline run run:all -- --replay=out/post-analysis.json
 *
 * photo + caption -> Call A -> PostAnalysis -> aggregator -> Call B -> validated
 * CommunityPlan, one per block, written to packages/pipeline/out/.
 *
 * --offline skips both model calls and reads the hand-written analyses in
 * `packages/fixtures/data/post-analysis.mock.json`, so the aggregator, the
 * validator and the fallbacks can be exercised with no API key and no spend.
 * The plans it produces come from the zoning defaults, not from Call B.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { postAnalysis, type CommunityGeo, type PostAnalysis } from '@living-city/contracts'
import {
  aggregateCommunity, analyzePosts, archetypeSignal, buildPlanningInput, buildTimeContext,
  computeTrend, emptyCycleState, loadTaxonomy, nextChangeSupport, planCommunity,
  planningInputHash, resolveImage, zoningDefaultPlan,
  type AggregatablePost, type CallARequest, type CommunityCycleState,
} from '../src/index'
import { arg, die, has, loadCity, loadPosts, writeJson, type SeedPost } from './_shared'

const MOCK_ANALYSES = 'packages/fixtures/data/post-analysis.mock.json'

const readAnalyses = (path: string): Map<string, PostAnalysis> => {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8')) as { analyses?: unknown[] }
  const list = Array.isArray(raw.analyses) ? raw.analyses : []
  const byId = new Map<string, PostAnalysis>()
  for (const item of list) {
    const parsed = postAnalysis.safeParse(item)
    if (parsed.success) byId.set(parsed.data.post_id, parsed.data)
    else {
      const id = (item as { post_id?: string }).post_id ?? '(unknown)'
      console.warn(`  skipped ${id}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    }
  }
  return byId
}

const analyseWithModel = async (
  posts: SeedPost[], city: CommunityGeo[], taxonomyVersion: string,
): Promise<Map<string, PostAnalysis>> => {
  const names = new Map(city.map((c) => [c.community_id, c.name]))
  const requests: CallARequest[] = []
  for (const post of posts) {
    const { image, state } = await resolveImage(post.image_url, {
      publicDir: 'apps/web/public',
      baseUrl: process.env.PUBLIC_BASE_URL,
    })
    requests.push({
      image,
      imageState: state,
      input: {
        post_id: post.id,
        text: post.text.slice(0, 1000),
        image_caption: null,
        community_id: post.community_id,
        community_name: names.get(post.community_id) ?? null,
        time_context: buildTimeContext(post.created_at),
        lang_hint: null,
        is_incident_report: post.is_incident_report,
        reported_incident_type: null,
        taxonomy_version: taxonomyVersion,
      },
    })
  }
  const results = await analyzePosts(requests)
  const byId = new Map<string, PostAnalysis>()
  for (const result of results) if (result.analysis) byId.set(result.post_id, result.analysis)
  console.log(`  analysed ${byId.size}/${results.length}`)
  return byId
}

const run = async () => {
  const offline = has('offline')
  const replay = arg('replay')
  const taxonomy = loadTaxonomy()
  const city = loadCity()
  const posts = loadPosts()
  const now = new Date()

  console.log(`city: ${city.length} blocks, seed: ${posts.length} posts, taxonomy v${taxonomy.version}`)
  console.log(`mode: ${offline ? 'offline (no model calls)' : replay ? `replay from ${replay}` : 'live'}\n`)

  // ---- 1. Call A ----------------------------------------------------------
  console.log('1. post analysis')
  let analyses: Map<string, PostAnalysis>
  if (offline) {
    analyses = readAnalyses(MOCK_ANALYSES)
    console.log(`  loaded ${analyses.size} hand-written analyses from ${MOCK_ANALYSES}`)
  } else if (replay) {
    analyses = readAnalyses(replay)
    console.log(`  loaded ${analyses.size} recorded analyses`)
  } else {
    analyses = await analyseWithModel(posts, city, taxonomy.version)
  }
  if (analyses.size === 0) die('no analyses available; run with --offline or set GEMINI_API_KEY')

  // ---- 2. aggregate, 3. plan ---------------------------------------------
  console.log('\n2. aggregation and 3. planning')
  const plans = []
  const states: Record<string, unknown> = {}

  for (const geo of city) {
    const aggregatable: AggregatablePost[] = []
    for (const post of posts) {
      if (post.community_id !== geo.community_id) continue
      const analysis = analyses.get(post.id)
      if (!analysis) continue
      aggregatable.push({
        post_id: post.id,
        user_id: post.user_id,
        created_at: post.created_at,
        hidden: post.hidden,
        status: post.status,
        analysis,
        engagement: 0,
      })
    }

    const state: CommunityCycleState = emptyCycleState()
    const { window, current, contributing_post_ids } = aggregateCommunity(aggregatable, { now })
    const trend = computeTrend(current, state.baseline)
    const signal = archetypeSignal(current, geo)
    const support = nextChangeSupport(0, signal, state.previousPlan?.archetype ?? null)

    const input = buildPlanningInput({
      geo,
      window,
      current,
      baseline: state.baseline,
      trend,
      previousPlan: state.previousPlan,
      consecutiveWindowsSupportingChange: support,
      taxonomy,
    })

    const planId = `${geo.community_id}:${window.end}`
    const result = offline
      ? {
        community_id: geo.community_id,
        plan: zoningDefaultPlan(geo, taxonomy, planId, 'offline run; zoning default applied'),
        source: 'zoning_default' as const,
        validator_log: [] as string[],
        input_hash: planningInputHash(input),
        changed: true,
      }
      : await planCommunity(input, geo, state.previousPlan, { taxonomy, planId })

    console.log(
      `  ${geo.community_id.padEnd(26)} ${String(window.post_count).padStart(2)} posts`
      + `  ${window.data_sufficiency.padEnd(6)} signal=${signal.padEnd(19)}`
      + ` -> ${result.plan.archetype} / ${result.plan.mood} (${result.source})`,
    )

    plans.push(result.plan)
    states[geo.community_id] = {
      window,
      current,
      trend,
      archetype_signal: signal,
      consecutive_windows_supporting_change: support,
      input_hash: result.input_hash,
      validator_log: result.validator_log,
      contributing_post_ids,
      plan_source: result.source,
    }
  }

  const plansPath = writeJson('plans.json', {
    generated_at: now.toISOString(),
    taxonomy_version: taxonomy.version,
    city_id: city[0]?.city_id ?? 'kw',
    plans,
  })
  const statePath = writeJson('community-state.json', { generated_at: now.toISOString(), states })
  writeJson('post-analysis.json', {
    generated_at: now.toISOString(),
    taxonomy_version: taxonomy.version,
    count: analyses.size,
    analyses: [...analyses.values()],
  })

  console.log(`\nwrote ${plansPath}`)
  console.log(`wrote ${statePath}`)
  console.log('\nEvery plan above is validated CommunityPlan JSON. Module 4 builds blocks from it.')
}

run().catch((error) => {
  console.error('\npipeline run failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
