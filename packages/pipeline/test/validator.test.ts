import { describe, expect, it } from 'vitest'
import type { CommunityGeo, CommunityPlan, PostInput } from '@living-city/contracts'
import { FALLBACK_TAXONOMY } from '../src/taxonomy'
import { validateCommunityPlan } from '../src/call-b/validate'
import { validatePostAnalysis } from '../src/call-a/validate'

/**
 * The validator is the safety net and is never cut (docs/roles/pipeline.md).
 * Every case here is a row from docs/03 section 7 or a rule from docs/02
 * section 4.4, and each one asserts the same thing: a bad model output becomes
 * a corrected plan or a rejected one, never a broken city.
 */

const GEO: CommunityGeo = {
  community_id: 'kw:test',
  city_id: 'kw',
  name: 'Test Block',
  source: 'synthetic',
  centroid: [-80.5, 43.46],
  bbox: [-80.51, 43.45, -80.49, 43.47],
  area_km2: 0.3,
  polygon_real: { type: 'Polygon', coordinates: [[[-80.51, 43.45], [-80.49, 43.45], [-80.49, 43.47], [-80.51, 43.45]]] },
  polygon_block: { type: 'Polygon', coordinates: [[[-80.51, 43.45], [-80.49, 43.45], [-80.49, 43.47], [-80.51, 43.45]]] },
  adjacent_ids: [],
  relative_position: { bearing_from_center: 'CENTER', distance_km_from_center: 0 },
  land_use_hints: {
    park_ratio: 0.1, water_adjacent: false, major_road: true,
    transit_stations: 0, campus: false, dominant_zoning: 'mixed',
  },
  // Tier 2 is the silhouette cap the plan may not exceed.
  capacity: { lot_count: 20, max_height_tier: 2 },
}

const PREVIOUS: CommunityPlan = {
  schema_version: '1.0',
  taxonomy_version: '1.0',
  community_id: 'kw:test',
  plan_id: 'kw:test:previous',
  summary: 'A steady mixed block.',
  archetype: 'mixed_use_default',
  identity_tags: ['brick', 'modern'],
  density: 3,
  height_profile: 'low_mid',
  building_composition: {
    residential: 40, retail: 25, cafe_bar: 20,
    office: 10, cultural_civic: 5, campus_industrial: 0,
  },
  vegetation: { level: 2, types: ['street_trees'] },
  activity: { pedestrian_density: 2, crowd_clusters: 1, vehicle_traffic: 2, behaviors: ['walking'] },
  decorations: [{ tag: 'benches', prominence: 1 }],
  mood: 'focused',
  palette: 'default_city',
  lighting: { signature_time: 'day', intensity: 3, color_temp: 'neutral', accents: [] },
  effects: [],
  hero_asset: null,
  stability: { change_magnitude: 'none', retained_from_previous: [], reasons: ['steady'] },
  confidence: 70,
}

const goodPlan = (overrides: Record<string, unknown> = {}) => ({
  schema_version: '1.0',
  taxonomy_version: '1.0',
  community_id: 'kw:test',
  plan_id: 'ignored',
  summary: 'A mixed block with a busy evening.',
  archetype: 'mixed_use_default',
  identity_tags: ['brick', 'modern'],
  density: 3,
  height_profile: 'low_mid',
  building_composition: {
    residential: 40, retail: 25, cafe_bar: 20,
    office: 10, cultural_civic: 5, campus_industrial: 0,
  },
  vegetation: { level: 2, types: ['street_trees'] },
  activity: { pedestrian_density: 3, crowd_clusters: 2, vehicle_traffic: 2, behaviors: ['walking', 'dining'] },
  decorations: [{ tag: 'string_lights', prominence: 2 }],
  mood: 'vibrant',
  palette: 'warm_pastel',
  lighting: { signature_time: 'dusk', intensity: 4, color_temp: 'warm', accents: ['string_lights'] },
  effects: ['music_notes'],
  hero_asset: null,
  stability: { change_magnitude: 'minor', retained_from_previous: [], reasons: ['nightlife +20 vs baseline'] },
  confidence: 80,
  ...overrides,
})

const context = (overrides: Partial<Parameters<typeof validateCommunityPlan>[1]> = {}) => ({
  geo: GEO,
  taxonomy: FALLBACK_TAXONOMY,
  previousPlan: PREVIOUS,
  dataSufficiency: 'high' as const,
  consecutiveWindowsSupportingChange: 0,
  planId: 'kw:test:now',
  ...overrides,
})

describe('Call B validator', () => {
  it('accepts a good plan and forces the caller-owned plan_id', () => {
    const result = validateCommunityPlan(goodPlan(), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.plan_id).toBe('kw:test:now')
    expect(result.log).toHaveLength(0)
  })

  it('rejects a plan for the wrong community and keeps nothing', () => {
    const result = validateCommunityPlan(
      goodPlan({ community_id: 'kw:somewhere-else' }), context(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('community_id mismatch')
  })

  it('rejects a plan built against another taxonomy version', () => {
    const result = validateCommunityPlan(goodPlan({ taxonomy_version: '0.9' }), context())
    expect(result.ok).toBe(false)
  })

  it('treats the model error object as "keep the previous plan"', () => {
    const result = validateCommunityPlan(
      { error: 'invalid_input', detail: 'missing community_id' }, context(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('invalid_input')
  })

  it('normalises building_composition to sum to exactly 100', () => {
    const result = validateCommunityPlan(goodPlan({
      building_composition: {
        residential: 50, retail: 30, cafe_bar: 30,
        office: 10, cultural_civic: 5, campus_industrial: 0,
      },
    }), context({ previousPlan: null }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const total = Object.values(result.plan.building_composition).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
    expect(result.log.join(' ')).toContain('normalised to 100')
  })

  it('clamps height_profile to capacity.max_height_tier', () => {
    const result = validateCommunityPlan(
      goodPlan({ height_profile: 'high' }), context({ previousPlan: null }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Tier 2 is low_mid. The silhouette is preserved whatever the model wanted.
    expect(result.plan.height_profile).toBe('low_mid')
    expect(result.log.join(' ')).toContain('exceeds capacity tier 2')
  })

  it('reverts an archetype change without two supporting windows', () => {
    const result = validateCommunityPlan(
      goodPlan({ archetype: 'nightlife_district' }),
      context({ consecutiveWindowsSupportingChange: 1, dataSufficiency: 'high' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.archetype).toBe('mixed_use_default')
    expect(result.plan.stability.retained_from_previous).toContain('archetype')
  })

  it('allows an archetype change with two supporting windows and enough data', () => {
    const result = validateCommunityPlan(
      goodPlan({ archetype: 'nightlife_district' }),
      context({ consecutiveWindowsSupportingChange: 2, dataSufficiency: 'high' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.archetype).toBe('nightlife_district')
  })

  it('still blocks an archetype change when the data is sparse', () => {
    const result = validateCommunityPlan(
      goodPlan({ archetype: 'nightlife_district' }),
      context({ consecutiveWindowsSupportingChange: 5, dataSufficiency: 'low' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.archetype).toBe('mixed_use_default')
  })

  it('scales a composition shift back to 15 points', () => {
    // 40 points moved out of residential into cafe_bar: way over the limit.
    const result = validateCommunityPlan(goodPlan({
      building_composition: {
        residential: 0, retail: 25, cafe_bar: 60,
        office: 10, cultural_civic: 5, campus_industrial: 0,
      },
    }), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const moved = (Object.keys(PREVIOUS.building_composition) as Array<keyof CommunityPlan['building_composition']>)
      .map((c) => result.plan.building_composition[c] - PREVIOUS.building_composition[c])
      .filter((d) => d > 0)
      .reduce((a, b) => a + b, 0)
    expect(moved).toBeLessThanOrEqual(15)
    expect(Object.values(result.plan.building_composition).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('limits density to one step per window', () => {
    const result = validateCommunityPlan(goodPlan({ density: 5 }), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.density).toBe(4)
  })

  it('drops unknown enum values and strips unknown top-level keys', () => {
    const result = validateCommunityPlan(goodPlan({
      effects: ['music_notes', 'lasers', 'dragons'],
      decorations: [{ tag: 'string_lights', prominence: 2 }, { tag: 'castle', prominence: 3 }],
      hero_asset: { tag: 'the_famous_market_hall_of_kitchener', prominence: 3 },
      coordinates: [[-80.5, 43.46]],
      mesh_name: 'block_01.glb',
    }), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.effects).toEqual(['music_notes'])
    expect(result.plan.decorations.map((d) => d.tag)).toEqual(['string_lights'])
    // An invented landmark cannot pass: the enum holds generic types only.
    expect(result.plan.hero_asset).toBeNull()
    expect(result.log.join(' ')).toContain('stripped unknown top-level key "coordinates"')
    expect(result.log.join(' ')).toContain('stripped unknown top-level key "mesh_name"')
  })

  it('pads identity_tags up to the minimum of two', () => {
    const result = validateCommunityPlan(goodPlan({ identity_tags: ['brick'] }), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.identity_tags.length).toBeGreaterThanOrEqual(2)
  })

  it('truncates an overlong summary rather than failing the plan', () => {
    const result = validateCommunityPlan(goodPlan({ summary: 'x'.repeat(400) }), context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.summary).toHaveLength(200)
  })
})

// ---------------------------------------------------------------------------

const postInput = (overrides: Partial<PostInput> = {}): PostInput => ({
  post_id: 'p-test',
  text: 'a normal post about the park',
  image_caption: null,
  community_id: 'kw:test',
  community_name: 'Test Block',
  time_context: { local_time: '14:00', day_type: 'weekday', time_bucket: 'afternoon', season: 'autumn' },
  lang_hint: 'en',
  is_incident_report: false,
  reported_incident_type: null,
  taxonomy_version: '1.0',
  ...overrides,
})

const rawAnalysis = (overrides: Record<string, unknown> = {}) => ({
  post_id: 'p-test',
  schema_version: '1.0',
  about_location: 80,
  confidence: 75,
  language: 'en',
  dimensions: {
    energy: 40, social: 30, creativity: null, stress: null, calm: 60,
    nature: 55, nightlife: null, food: null, commerce: null, culture: null, fitness: null,
  },
  valence: 50,
  activity_type: 'relaxing',
  place_type: 'park',
  temporal_scope: 'moment',
  event_scale: 'none',
  tags: ['quiet'],
  keywords: ['bench'],
  image_evidence: [],
  content_flags: [],
  incident: { type: 'none', severity: 0, location_hint: null, evidence: 'none' },
  ...overrides,
})

describe('Call A validator', () => {
  const opts = { input: postInput(), taxonomy: FALLBACK_TAXONOMY }

  it('accepts a clean analysis with no corrections', () => {
    const { analysis, log } = validatePostAnalysis(rawAnalysis(), opts)
    expect(analysis).not.toBeNull()
    expect(log).toHaveLength(0)
  })

  it('forces the input post_id, so an analysis cannot land on the wrong post', () => {
    const { analysis, log } = validatePostAnalysis(rawAnalysis({ post_id: 'p-other' }), opts)
    expect(analysis?.post_id).toBe('p-test')
    expect(log.join(' ')).toContain('post_id')
  })

  it('zeroes everything on unsafe content', () => {
    const { analysis } = validatePostAnalysis(rawAnalysis({
      content_flags: ['unsafe'],
      about_location: 90,
      keywords: ['something awful'],
    }), opts)
    expect(analysis?.about_location).toBe(0)
    expect(analysis?.keywords).toEqual([])
    expect(Object.values(analysis?.dimensions ?? {}).every((v) => v === null)).toBe(true)
  })

  it('drops tags outside the controlled vocabulary', () => {
    const { analysis, log } = validatePostAnalysis(
      rawAnalysis({ tags: ['quiet', 'castle_vibes', 'dragons'] }), opts,
    )
    expect(analysis?.tags).toEqual(['quiet'])
    expect(log.join(' ')).toContain('uncontrolled tag')
  })

  it('drops a location_hint that carries coordinates', () => {
    const { analysis, log } = validatePostAnalysis(rawAnalysis({
      incident: {
        type: 'flooding', severity: 2,
        location_hint: '43.4643, -80.5204', evidence: 'observed',
      },
    }), opts)
    expect(analysis?.incident.location_hint).toBeNull()
    expect(log.join(' ')).toContain('looked like coordinates')
  })

  it('forces severity 0 when the incident type is none', () => {
    const { analysis } = validatePostAnalysis(rawAnalysis({
      incident: { type: 'none', severity: 3, location_hint: null, evidence: 'observed' },
    }), opts)
    expect(analysis?.incident.severity).toBe(0)
    expect(analysis?.incident.evidence).toBe('none')
  })

  it('keeps the model incident type but flags a contradiction with the form', () => {
    const { analysis, log } = validatePostAnalysis(rawAnalysis({
      incident: { type: 'fallen_tree', severity: 2, location_hint: 'queen st', evidence: 'observed' },
    }), {
      input: postInput({ is_incident_report: true, reported_incident_type: 'flooding' }),
      taxonomy: FALLBACK_TAXONOMY,
    })
    expect(analysis?.incident.type).toBe('fallen_tree')
    expect(analysis?.incident.evidence).toBe('form')
    expect(analysis?.content_flags).toContain('unclear')
    expect(log.join(' ')).toContain('form said "flooding"')
  })

  it('adds no_community when the post fell outside every polygon', () => {
    const { analysis } = validatePostAnalysis(rawAnalysis(), {
      input: postInput({ community_id: null, community_name: null }),
      taxonomy: FALLBACK_TAXONOMY,
    })
    expect(analysis?.content_flags).toContain('no_community')
  })

  it('caps about_location at 20 for advertising', () => {
    const { analysis } = validatePostAnalysis(
      rawAnalysis({ content_flags: ['advertising'], about_location: 85 }), opts,
    )
    expect(analysis?.about_location).toBe(20)
  })

  it('strips handles and phone numbers out of keywords', () => {
    const { analysis } = validatePostAnalysis(
      rawAnalysis({ keywords: ['bench', '@someuser', '519-555-0134'] }), opts,
    )
    expect(analysis?.keywords).toEqual(['bench'])
  })

  it('substitutes unknown for an invented activity_type', () => {
    const { analysis, log } = validatePostAnalysis(
      rawAnalysis({ activity_type: 'jousting' }), opts,
    )
    expect(analysis?.activity_type).toBe('unknown')
    expect(log.join(' ')).toContain('activity_type')
  })
})
