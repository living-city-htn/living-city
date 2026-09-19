/**
 * Fixture validator. Plain node, no dependencies: `node scripts/validate.mjs`.
 *
 * Checks the fixtures against the enums and rules in docs/03 section 5.3 and
 * docs/04 section 3, plus the demo invariants the script depends on. This is a
 * stand-in for the real validator that Pipeline owns (docs/02 section 4.4) and
 * a guard against fixtures drifting away from the spec while modules are stubbed.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(here, '..', 'data', f), 'utf8'))

// The city is the Map owner's processed data, not a Product fixture.
const city = JSON.parse(
  readFileSync(new URL('../../map/data/processed/city.json', import.meta.url), 'utf8'),
)
city.slots = JSON.parse(
  readFileSync(new URL('../../map/data/processed/slots.json', import.meta.url), 'utf8'),
)
const seed = read('posts.seed.json')
const plansFile = read('plans.fallback.json')
const shop = read('shop.fallback.json')

const fails = []
const warns = []
const check = (cond, msg) => { if (!cond) fails.push(msg) }
const warn = (cond, msg) => { if (!cond) warns.push(msg) }

// ---- enums, docs/03 section 5.3 -------------------------------------------
const E = {
  archetype: 'residential_quiet residential_lively commercial_core nightlife_district creative_quarter green_retreat campus_hub waterfront_leisure civic_center transit_hub maker_industrial market_street mixed_use_default',
  mood: 'cozy vibrant serene busy gritty festive melancholic focused playful elegant',
  palette: 'warm_pastel cool_pastel neon_night earthy_green soft_grey sunset_orange ocean_blue brick_red candy_pop default_city',
  vegetation: 'street_trees mature_trees park_lawn flower_beds hedges wild_meadow planters rooftop_green',
  behaviors: 'walking sitting jogging dancing cycling dining shopping performing dog_walking skateboarding studying queueing',
  decorations: 'string_lights banners mural sculpture fountain food_trucks market_stalls benches bike_racks neon_signs outdoor_seating playground sports_court stage kiosks flags lanterns graffiti construction_barriers bus_shelter',
  accents: 'streetlamps_warm streetlamps_cool window_glow neon string_lights lanterns spotlights',
  effects: 'fireflies confetti music_notes falling_leaves rain snow fog sparkles steam birds fireworks heart_particles',
  hero: 'clock_tower stadium ferris_wheel museum market_hall concert_hall giant_tree fountain_plaza lighthouse university_hall transit_station observation_deck',
  identity: 'modern historic brick glass wood colorful minimal industrial cozy upscale student family tourist bohemian',
  height: 'low low_mid mid mid_high high',
  time: 'dawn day golden_hour dusk night',
}
for (const k of Object.keys(E)) E[k] = new Set(E[k].split(' '))
const inEnum = (set, values, where) =>
  values.forEach((v) => check(set.has(v), `${where}: "${v}" is not in the enum`))

// ---- city ------------------------------------------------------------------
const ids = new Set(city.communities.map((c) => c.community_id))
check(ids.size === city.communities.length, 'city: duplicate community_id')
for (const c of city.communities) {
  check(c.community_id.startsWith('kw:'), `city: ${c.community_id} missing the kw: prefix`)
  check(c.capacity.max_height_tier >= 1 && c.capacity.max_height_tier <= 5, `city: ${c.community_id} height tier out of 1-5`)
  c.adjacent_ids.forEach((a) => check(ids.has(a), `city: ${c.community_id} is adjacent to unknown ${a}`))
}
for (const id of ids) {
  const n = city.slots.filter((s) => s.community_id === id).length
  check(n === 3, `slots: ${id} has ${n} decoration slots, the cap is exactly 3 (docs/04 section 3)`)
}

// ---- plans -----------------------------------------------------------------
const allPlans = [...plansFile.plans, plansFile.preset_festival]
for (const p of allPlans) {
  const w = `plan ${p.plan_id}`
  check(ids.has(p.community_id), `${w}: unknown community_id`)
  inEnum(E.archetype, [p.archetype], w)
  inEnum(E.mood, [p.mood], w)
  inEnum(E.palette, [p.palette], w)
  inEnum(E.height, [p.height_profile], w)
  inEnum(E.time, [p.lighting.signature_time], w)
  inEnum(E.identity, p.identity_tags, w)
  inEnum(E.vegetation, p.vegetation.types, w)
  inEnum(E.behaviors, p.activity.behaviors, w)
  inEnum(E.decorations, p.decorations.map((d) => d.tag), w)
  inEnum(E.accents, p.lighting.accents, w)
  inEnum(E.effects, p.effects, w)
  if (p.hero_asset) inEnum(E.hero, [p.hero_asset.tag], w)

  const sum = Object.values(p.building_composition).reduce((a, b) => a + b, 0)
  check(sum === 100, `${w}: building_composition sums to ${sum}, must be 100`)

  check(p.identity_tags.length >= 2 && p.identity_tags.length <= 4, `${w}: identity_tags must be 2-4`)
  check(p.decorations.length <= 8, `${w}: at most 8 decorations`)
  check(p.effects.length <= 3, `${w}: at most 3 effects`)
  check(p.summary.length <= 200, `${w}: summary over 200 chars`)

  const cap = city.communities.find((c) => c.community_id === p.community_id)?.capacity.max_height_tier
  const tier = ['low', 'low_mid', 'mid', 'mid_high', 'high'].indexOf(p.height_profile) + 1
  check(tier <= cap, `${w}: height_profile ${p.height_profile} exceeds the block's max tier ${cap}`)
}

// ---- demo invariants, docs/04 sections 2 and 8 -----------------------------
const DEMO = 'kw:victoria-park'
const demoPosts = seed.posts.filter((p) => p.community_id === DEMO)
check(demoPosts.length <= 3, `demo block has ${demoPosts.length} posts; it must stay sparse (docs/04 section 8)`)
const base = plansFile.plans.find((p) => p.community_id === DEMO)
const fest = plansFile.preset_festival
check(fest.community_id === DEMO, 'preset festival plan must target the demo block')
check(base.mood !== fest.mood, 'preset festival must change mood, or moment 4 will not read')
check(fest.lighting.intensity > base.lighting.intensity, 'preset festival must be visibly brighter than the calm plan')
check(fest.effects.length > 0, 'preset festival needs at least one effect')
check(fest.archetype === base.archetype, 'preset festival must retain archetype: identity stays, mood changes')
check(fest.building_composition.retail === base.building_composition.retail,
  'preset festival must not change buildings: it is a cosmetic event change')

// ---- seed posts ------------------------------------------------------------
check(seed.users.some((u) => u.role === 'government'), 'seed needs one government account')
const incidents = seed.posts.filter((p) => p.is_incident_report)
check(incidents.length === 3, `seed needs 3 incident posts, found ${incidents.length}`)
check(incidents.some((p) => p.image_url), 'at least one incident post needs a photo (moment 6)')
for (const p of seed.posts) {
  check(ids.has(p.community_id), `post ${p.id}: unknown community ${p.community_id}`)
  check(typeof p.lon === 'number' && typeof p.lat === 'number', `post ${p.id}: missing coordinates`)
  check(p.text.trim().length > 0, `post ${p.id}: empty text`)
}
for (const id of ids) {
  if (id === DEMO) continue
  const n = seed.posts.filter((p) => p.community_id === id).length
  warn(n >= 3, `${id} has ${n} seed posts; Stage 0 target is 3 per block`)
}

// ---- shop, docs/04 section 3 ----------------------------------------------
check(shop.items.length === 6, `shop must have exactly 6 items, found ${shop.items.length}`)
inEnum(new Set([...E.decorations, ...E.vegetation]), shop.items.map((i) => i.item_tag), 'shop')
const cheapest = Math.min(...shop.items.map((i) => i.price))
check(cheapest <= 20, 'at least one shop item must cost 20 or less, so one demo post buys one (docs/04 section 3)')

// ---- report ----------------------------------------------------------------
for (const w of warns) console.log(`warn  ${w}`)
for (const f of fails) console.log(`FAIL  ${f}`)
console.log(
  fails.length
    ? `\n${fails.length} failure(s), ${warns.length} warning(s)`
    : `\nok: ${city.communities.length} blocks, ${city.slots.length} slots, ${seed.posts.length} posts, ${allPlans.length} plans, ${shop.items.length} shop items` +
      (warns.length ? ` (${warns.length} warning(s))` : ''),
)
process.exit(fails.length ? 1 : 0)
