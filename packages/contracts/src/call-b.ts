import { z } from 'zod'
import { dimensions } from './call-a'
import { communityGeoForPlanning } from './geo'
import {
  BUILDING_CATEGORIES, DIMENSIONS, archetype, behavior, changeMagnitude,
  colorTemp, dataSufficiency, decoration, effect, heightProfile, heroAsset,
  identityTag, lightingAccent, mood, palette, signatureTime, vegetationType,
} from './enums'

/** docs/03 sections 2.3 and 3.2. */

const share = z.number().min(0).max(1)
const level = z.number().int().min(0).max(5)

export const semanticState = z.object({
  dimensions,
  valence: z.number().min(-100).max(100).nullable(),
  top_tags: z.array(z.object({ tag: z.string(), share })).max(10),
  top_keywords: z.array(z.object({ kw: z.string(), share })).max(10),
  activity_mix: z.record(z.string(), share),
  place_mix: z.record(z.string(), share),
  time_mix: z.object({ morning: share, afternoon: share, evening: share, night: share }),
  temporal_mix: z.object({ moment: share, recurring: share, persistent: share }),
})

export const buildingComposition = z.object(
  Object.fromEntries(
    BUILDING_CATEGORIES.map((c) => [c, z.number().int().min(0).max(100)]),
  ) as Record<(typeof BUILDING_CATEGORIES)[number], z.ZodNumber>,
)

export const communityPlan = z.object({
  schema_version: z.literal('1.0'),
  taxonomy_version: z.string(),
  community_id: z.string(),
  plan_id: z.string(),

  summary: z.string().max(200),
  archetype,
  identity_tags: z.array(identityTag).min(2).max(4),

  density: z.number().int().min(1).max(5),
  height_profile: heightProfile,
  building_composition: buildingComposition,

  vegetation: z.object({ level, types: z.array(vegetationType).max(4) }),

  activity: z.object({
    pedestrian_density: level,
    crowd_clusters: level,
    vehicle_traffic: level,
    behaviors: z.array(behavior).max(5),
  }),

  decorations: z.array(
    z.object({ tag: decoration, prominence: z.number().int().min(1).max(3) }),
  ).max(8),

  mood,
  palette,
  lighting: z.object({
    signature_time: signatureTime,
    intensity: level,
    color_temp: colorTemp,
    accents: z.array(lightingAccent).max(4),
  }),
  effects: z.array(effect).max(3),
  hero_asset: z.object({
    tag: heroAsset,
    prominence: z.number().int().min(1).max(3),
  }).nullable(),

  stability: z.object({
    change_magnitude: changeMagnitude,
    retained_from_previous: z.array(z.string()),
    reasons: z.array(z.string().max(80)).min(1).max(3),
  }),
  confidence: z.number().min(0).max(100),
})
.refine(
  (p) => Object.values(p.building_composition).reduce((a, b) => a + b, 0) === 100,
  { message: 'building_composition must sum to exactly 100', path: ['building_composition'] },
)

/** What Call B may return instead of a plan when the input is unusable. docs/03 rule 20. */
export const planError = z.object({
  error: z.literal('invalid_input'),
  detail: z.string(),
})
export const communityPlanOrError = z.union([communityPlan, planError])

export const planningInput = z.object({
  schema_version: z.literal('1.0'),
  taxonomy_version: z.string(),
  community: communityGeoForPlanning,
  window: z.object({
    start: z.string(),
    end: z.string(),
    post_count: z.number().int().min(0),
    distinct_authors: z.number().int().min(0),
    data_sufficiency: dataSufficiency,
  }),
  current: semanticState,
  baseline: semanticState.nullable(),
  /** current minus baseline, per dimension. A dimension with no data is absent. */
  trend: z.object(
    Object.fromEntries(
      DIMENSIONS.map((d) => [d, z.number().min(-100).max(100).optional()]),
    ) as Record<(typeof DIMENSIONS)[number], z.ZodOptional<z.ZodNumber>>,
  ),
  previous_plan: communityPlan.nullable(),
  consecutive_windows_supporting_change: z.number().int().min(0),
  taxonomy: z.unknown(),   // AssetTaxonomy, see taxonomy.ts; kept loose at the boundary
})

export type SemanticState = z.infer<typeof semanticState>
export type BuildingComposition = z.infer<typeof buildingComposition>
export type CommunityPlan = z.infer<typeof communityPlan>
export type PlanningInput = z.infer<typeof planningInput>
export type PlanError = z.infer<typeof planError>
