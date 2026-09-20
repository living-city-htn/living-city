const fs = require('fs')
const path = require('path')

// The package is "type": "module", so the CommonJS build in dist/ needs its own
// package.json to be loadable. Written here rather than in the build script so
// the build stays a single plain tsc invocation.
const dist = path.join(__dirname, '..', 'dist')
if (!fs.existsSync(dist)) {
  console.error('dist/ is missing - run `pnpm build` first')
  process.exit(1)
}
fs.writeFileSync(path.join(dist, 'package.json'), '{"type":"commonjs"}')

const C = require('../dist/index.js')
const F = __dirname + '/../../fixtures/data/'
const read = (f) => JSON.parse(fs.readFileSync(F + f, 'utf8'))
const strip = (v) => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === 'object')
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, strip(x)]))
    : v

let fail = 0
const run = (name, schema, value) => {
  const r = schema.safeParse(value)
  if (r.success) { console.log(`ok    ${name}`); return }
  fail++
  console.log(`FAIL  ${name}`)
  for (const i of r.error.issues.slice(0, 4)) console.log(`        ${i.path.join('.')}: ${i.message}`)
}

// The city is Map's processed data, not a Product fixture: city.fallback.json
// was dropped in 3d72b60 so the two could not drift. Slots live beside it.
const M = path.join(__dirname, '..', '..', 'map', 'data', 'processed')
const readMap = (f) => JSON.parse(fs.readFileSync(path.join(M, f), 'utf8'))
const city = strip(readMap('city.json'))
city.slots = strip(readMap('slots.json'))
const plans = strip(read('plans.fallback.json'))
const seed = strip(read('posts.seed.json'))

city.communities.forEach((c, i) => run(`CommunityGeo[${i}] ${c.community_id}`, C.communityGeo, c))
run('DecorationSlot[]', C.decorationSlot.array(), city.slots)
plans.plans.forEach((p) => run(`CommunityPlan ${p.community_id}`, C.communityPlan, p))
run('CommunityPlan preset_festival', C.communityPlan, plans.preset_festival)
run('Post[] (seed)', C.post.array(), seed.posts.map((p) => ({ ...p, hidden_reason: p.hidden_reason ?? null })))

// the ->B subset must drop polygons before anything reaches the prompt
const sub = C.toPlanningGeo(city.communities[0])
run('CommunityGeoForPlanning', C.communityGeoForPlanning, sub)
const leaked = ['polygon_real', 'polygon_block', 'centroid', 'bbox'].filter((k) => k in sub)
if (leaked.length) { fail++; console.log(`FAIL  ->B subset leaks: ${leaked.join(', ')}`) }
else console.log('ok    ->B subset drops polygons, centroid and bbox')

// negative controls: the schemas must REJECT these
const bad = (name, schema, value) => {
  if (schema.safeParse(value).success) { fail++; console.log(`FAIL  should have rejected: ${name}`) }
  else console.log(`ok    rejects ${name}`)
}
const good = plans.plans[0]
bad('composition that does not sum to 100', C.communityPlan,
    { ...good, building_composition: { ...good.building_composition, retail: good.building_composition.retail + 5 } })
bad('an invented hero asset', C.communityPlan, { ...good, hero_asset: { tag: 'cn_tower', prominence: 2 } })
bad('four effects', C.communityPlan, { ...good, effects: ['rain', 'snow', 'fog', 'sparkles'] })
bad('one identity tag', C.communityPlan, { ...good, identity_tags: ['modern'] })
bad('a 300-char summary', C.communityPlan, { ...good, summary: 'x'.repeat(300) })

const analysis = {
  post_id: 'p1', schema_version: '1.0', about_location: 95, confidence: 88, language: 'en',
  dimensions: Object.fromEntries(C.DIMENSIONS.map((d) => [d, null])),
  valence: 10, activity_type: 'socializing', place_type: 'street', temporal_scope: 'moment',
  event_scale: 'small', tags: [], keywords: [], image_evidence: [], content_flags: [],
  incident: { type: 'none', severity: 0, location_hint: null, evidence: 'none' },
}
run('PostAnalysis (minimal valid)', C.postAnalysis, analysis)
bad('incident type none with severity 2', C.postAnalysis, { ...analysis, incident: { ...analysis.incident, severity: 2 } })
bad('fallen_tree with severity 0', C.postAnalysis, { ...analysis, incident: { type: 'fallen_tree', severity: 0, location_hint: null, evidence: 'observed' } })
bad('unsafe post with about_location 95', C.postAnalysis, { ...analysis, content_flags: ['unsafe'] })

console.log(fail ? `\n${fail} failure(s)` : '\nall contract checks passed')
process.exit(fail ? 1 : 0)
