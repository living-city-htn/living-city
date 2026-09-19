/**
 * Run Call A over the seed set and write the analyses out as JSON.
 *
 *   npm --workspace @living-city/pipeline run run:a
 *   npm --workspace @living-city/pipeline run run:a -- --community=kw:victoria-park
 *
 * This is the Gate 1 criterion Pipeline owns: "Call A output on the seed set
 * is valid with correct incidents." The report at the end is what you read to
 * decide whether a prompt edit helped - rejection rate, correction count, and
 * whether the three seeded incidents came back with the two near-misses left
 * alone.
 */
import { buildTimeContext, analyzePosts, loadTaxonomy, resolveImage, type CallARequest } from '../src/index'
import { arg, die, loadCity, loadPosts, writeJson } from './_shared'

/** docs/04 section 3 seeds three incidents; these are the posts that carry them. */
const EXPECTED_INCIDENTS = new Set(['p-007', 'p-020', 'p-022'])
/** Posts that read like incidents but are not. docs/03 rules 23 and 27. */
const EXPECTED_NEAR_MISSES = new Set(['p-012', 'p-021'])

const run = async () => {
  const taxonomy = loadTaxonomy()
  const city = loadCity()
  const names = new Map(city.map((c) => [c.community_id, c.name]))
  const posts = loadPosts(arg('community') || undefined)

  if (posts.length === 0) die('no seed posts matched')

  console.log(`Call A over ${posts.length} seed post(s), taxonomy v${taxonomy.version}\n`)

  const requests: CallARequest[] = []
  for (const post of posts) {
    // Seed images are paths into the web app's public directory. There is no
    // public directory yet, so they resolve as "missing" and the validator
    // adds image_missing - which is exactly docs/03 rule 9 working.
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
        taxonomy_version: taxonomy.version,
      },
    })
  }

  const results = await analyzePosts(requests, { taxonomy })

  const analyses = results.map((r) => r.analysis).filter((a) => a !== null)
  const failures = results.filter((r) => r.analysis === null)
  const corrections = results.reduce((sum, r) => sum + r.validator_log.length, 0)

  const path = writeJson('post-analysis.json', {
    generated_at: new Date().toISOString(),
    taxonomy_version: taxonomy.version,
    count: analyses.length,
    analyses,
  })
  writeJson('post-analysis.report.json', {
    generated_at: new Date().toISOString(),
    results: results.map((r) => ({
      post_id: r.post_id,
      ok: r.analysis !== null,
      hide: r.hide,
      error: r.error,
      corrections: r.validator_log,
      incident: r.analysis?.incident ?? null,
      flags: r.analysis?.content_flags ?? [],
    })),
  })

  // ---- the report you actually read ---------------------------------------

  console.log(`analysed      ${analyses.length}/${results.length}`)
  console.log(`rejected      ${failures.length} (${((failures.length / results.length) * 100).toFixed(1)}%)`)
  console.log(`corrections   ${corrections}`)
  console.log(`auto-hidden   ${results.filter((r) => r.hide).length}`)

  const found = new Set(
    results.filter((r) => r.analysis && r.analysis.incident.type !== 'none').map((r) => r.post_id),
  )
  const missed = [...EXPECTED_INCIDENTS].filter((id) => !found.has(id))
  const spurious = [...found].filter((id) => !EXPECTED_INCIDENTS.has(id))
  const nearMissesTripped = [...EXPECTED_NEAR_MISSES].filter((id) => found.has(id))

  console.log('\nincidents')
  for (const result of results) {
    const incident = result.analysis?.incident
    if (!incident || incident.type === 'none') continue
    console.log(
      `  ${result.post_id}  ${incident.type} sev${incident.severity} `
      + `(${incident.evidence}) ${incident.location_hint ?? '-'}`,
    )
  }
  if (missed.length) console.log(`  MISSED seeded incidents: ${missed.join(', ')}`)
  if (nearMissesTripped.length) {
    console.log(`  FALSE POSITIVE on near-miss posts: ${nearMissesTripped.join(', ')}`)
  }
  if (spurious.length && !nearMissesTripped.length) {
    console.log(`  extra incidents (check these are real): ${spurious.join(', ')}`)
  }

  const gatePassed = missed.length === 0 && nearMissesTripped.length === 0 && failures.length === 0
  console.log(`\nGate 1 (Call A valid on seed set with correct incidents): ${gatePassed ? 'PASS' : 'FAIL'}`)
  console.log(`\nwrote ${path}`)
  if (!gatePassed) process.exitCode = 1
}

run().catch((error) => {
  console.error('\nCall A run failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
