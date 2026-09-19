/**
 * The Stage 0 gate item: "one trivial Gemini call with the real CommunityPlan
 * response schema. If the schema is rejected for nesting or size, flatten it
 * now, before anyone builds against it." (docs/roles/pipeline.md)
 *
 *   npm --workspace @living-city/pipeline run check:schema
 *
 * Costs one small Call A and one small Call B. Run it once before anyone
 * builds against the contracts, and again after any schema edit.
 */
import { communityPlan, postAnalysis } from '@living-city/contracts'
import {
  callASystemPrompt, callBSystemPrompt, communityPlanSchema, env, getProvider,
  loadTaxonomy, postAnalysisBatchSchema,
} from '../src/index'
import { die } from './_shared'

const TRIVIAL_POST = {
  post_id: 'schema-check-1',
  text: 'quiet morning by the water, two herons and nobody else',
  image_caption: null,
  community_id: 'kw:test',
  community_name: 'Test Block',
  time_context: {
    local_time: '07:30', day_type: 'weekday', time_bucket: 'morning', season: 'autumn',
  },
  lang_hint: 'en',
  is_incident_report: false,
  reported_incident_type: null,
  taxonomy_version: '1.0',
}

const TRIVIAL_PLANNING_INPUT = {
  schema_version: '1.0',
  taxonomy_version: '1.0',
  community: {
    community_id: 'kw:test', city_id: 'kw', name: 'Test Block', source: 'synthetic',
    area_km2: 0.3, adjacent_ids: [],
    relative_position: { bearing_from_center: 'CENTER', distance_km_from_center: 0 },
    land_use_hints: {
      park_ratio: 0.4, water_adjacent: true, major_road: false,
      transit_stations: 0, campus: false, dominant_zoning: 'green',
    },
    capacity: { lot_count: 12, max_height_tier: 2 },
  },
  window: {
    start: '2026-09-18', end: '2026-09-19',
    post_count: 3, distinct_authors: 2, data_sufficiency: 'low',
  },
  current: {
    dimensions: {
      energy: 20, social: 15, creativity: null, stress: null, calm: 80, nature: 85,
      nightlife: null, food: null, commerce: null, culture: null, fitness: 40,
    },
    valence: 55,
    top_tags: [{ tag: 'quiet', share: 0.6 }, { tag: 'waterfront', share: 0.4 }],
    top_keywords: [{ kw: 'herons', share: 0.3 }],
    activity_mix: { relaxing: 0.7, exercising: 0.3 },
    place_mix: { park: 0.6, waterfront: 0.4 },
    time_mix: { morning: 0.7, afternoon: 0.3, evening: 0, night: 0 },
    temporal_mix: { moment: 0.4, recurring: 0.6, persistent: 0 },
  },
  baseline: null,
  trend: {},
  previous_plan: null,
  consecutive_windows_supporting_change: 0,
}

const run = async () => {
  const taxonomy = loadTaxonomy()
  const provider = getProvider()

  if (!provider.available()) {
    die(
      'GEMINI_API_KEY is not set.\n'
      + '  Copy .env.example to .env.local, fill in the key, then:\n'
      + '    GEMINI_API_KEY=... npm --workspace @living-city/pipeline run check:schema',
    )
  }

  console.log(`provider: ${provider.name}`)
  console.log(`taxonomy: v${taxonomy.version}`)
  console.log(`call A model: ${env.modelCallA()}`)
  console.log(`call B model: ${env.modelCallB()}\n`)

  console.log('Call A: sending one post with the PostAnalysis array schema...')
  const a = await provider.complete({
    system: callASystemPrompt(taxonomy),
    payload: [TRIVIAL_POST],
    schema: postAnalysisBatchSchema,
    model: env.modelCallA(),
    maxOutputTokens: env.maxTokensCallA(),
  })
  const first = Array.isArray(a.json) ? a.json[0] : a.json
  const aParsed = postAnalysis.safeParse(first)
  console.log(`  accepted, ${a.attempts} attempt(s), ${a.latencyMs}ms`)
  console.log(`  parses as PostAnalysis: ${aParsed.success}`)
  if (!aParsed.success) {
    console.log(`  issues: ${aParsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    console.log('  (ranges and cross-field rules are the validator\'s job, so some issues here are expected)')
  }

  console.log('\nCall B: sending one PlanningInput with the CommunityPlan schema...')
  const b = await provider.complete({
    system: callBSystemPrompt(taxonomy),
    payload: TRIVIAL_PLANNING_INPUT,
    schema: communityPlanSchema,
    model: env.modelCallB(),
    maxOutputTokens: env.maxTokensCallB(),
  })
  const bParsed = communityPlan.safeParse(b.json)
  console.log(`  accepted, ${b.attempts} attempt(s), ${b.latencyMs}ms`)
  console.log(`  parses as CommunityPlan: ${bParsed.success}`)
  if (!bParsed.success) {
    console.log(`  issues: ${bParsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }

  console.log('\nThe response schema was accepted by the provider. Gate 0 item met.')
  console.log('Raw Call B output:\n')
  console.log(JSON.stringify(b.json, null, 2))
}

run().catch((error) => {
  console.error('\nschema check failed:', error instanceof Error ? error.message : error)
  console.error(
    '\nIf the failure names nesting, size, or an unsupported schema keyword,'
    + '\nflatten packages/pipeline/src/call-b/schema.ts NOW, before anyone builds against it.',
  )
  process.exit(1)
})
