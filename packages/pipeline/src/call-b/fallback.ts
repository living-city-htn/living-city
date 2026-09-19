import {
  BUILDING_CATEGORIES, communityPlan, heightTier, HEIGHT_PROFILE,
  type AssetTaxonomy, type CommunityGeo, type CommunityPlan,
} from '@living-city/contracts'
import { zoningDefault } from '../taxonomy'

/**
 * The plan a block gets when there is nothing else: no posts, no previous plan,
 * or a Call B that failed twice. docs/03 example 6.6.
 *
 * Deterministic, built from the taxonomy's zoning defaults, and deliberately
 * dull: density at most 2, a calm mood, no effects, no hero asset, low
 * confidence. A block with real posts has to look alive next to this one.
 *
 * This is also the reason a provider outage is survivable. Every block still
 * renders; it just renders as its zoning.
 */
export const zoningDefaultPlan = (
  geo: CommunityGeo,
  taxonomy: AssetTaxonomy,
  planId: string,
  reason = 'no posts observed; zoning default applied',
): CommunityPlan => {
  const zoning = geo.land_use_hints.dominant_zoning
  const base = zoningDefault(taxonomy, zoning)

  const composition = Object.fromEntries(
    BUILDING_CATEGORIES.map((c) => [
      c,
      Math.max(0, Math.round(Number((base.building_composition as Record<string, number>)?.[c] ?? 0))),
    ]),
  ) as CommunityPlan['building_composition']

  const total = Object.values(composition).reduce((a, b) => a + b, 0)
  if (total !== 100) {
    // Defaults are authored to sum to 100; if one does not, residential
    // absorbs the difference rather than the plan failing to parse.
    composition.residential = Math.max(0, composition.residential + (100 - total))
  }

  let heightProfile = (typeof base.height_profile === 'string' ? base.height_profile : 'low') as CommunityPlan['height_profile']
  if (heightTier(heightProfile) > geo.capacity.max_height_tier) {
    heightProfile = HEIGHT_PROFILE[geo.capacity.max_height_tier - 1] ?? 'low'
  }

  const vegetation = base.vegetation as { level?: number; types?: string[] } | undefined

  return communityPlan.parse({
    schema_version: '1.0',
    taxonomy_version: taxonomy.version,
    community_id: geo.community_id,
    plan_id: planId,
    summary: `${geo.name} is quiet for now, drawn from its ${zoning} zoning.`.slice(0, 200),
    archetype: base.archetype ?? 'mixed_use_default',
    identity_tags: Array.isArray(base.identity_tags) && base.identity_tags.length >= 2
      ? base.identity_tags
      : ['minimal', 'modern'],
    density: Math.min(2, Number(base.density ?? 2)),
    height_profile: heightProfile,
    building_composition: composition,
    vegetation: { level: vegetation?.level ?? 2, types: vegetation?.types ?? [] },
    activity: {
      pedestrian_density: 1,
      crowd_clusters: 0,
      vehicle_traffic: 1,
      behaviors: ['walking'],
    },
    decorations: [],
    mood: base.mood === 'focused' ? 'focused' : 'serene',
    palette: base.palette ?? 'default_city',
    lighting: { signature_time: 'day', intensity: 3, color_temp: 'neutral', accents: [] },
    effects: [],
    hero_asset: null,
    stability: {
      change_magnitude: 'none',
      retained_from_previous: [],
      reasons: [reason.slice(0, 80)],
    },
    confidence: 20,
  })
}
