import {
  ARCHETYPE, BEHAVIOR, BUILDING_CATEGORIES, DECORATION, EFFECT, HEIGHT_PROFILE,
  HERO_ASSET, IDENTITY_TAG, LIGHTING_ACCENT, MOOD, PALETTE, VEGETATION_TYPE,
} from '@living-city/contracts'
import type { JsonSchema } from '../provider/types'

/**
 * The `responseSchema` for Call B. docs/03 section 3.2.
 *
 * The Stage 0 checklist in docs/roles/pipeline.md exists because of this file:
 * "one trivial Gemini call with the real CommunityPlan response schema. If the
 * schema is rejected for nesting or size, flatten it now, before anyone builds
 * against it." `pnpm --filter @living-city/pipeline check:schema` is that call.
 *
 * Nesting is three levels at most (plan -> lighting -> accents[]), which is
 * inside what the API accepts. Numeric ranges and the sum-to-100 rule are not
 * expressible here and live in the validator, where docs/02 section 4.4 puts
 * them anyway.
 */

const enumOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] })
const arrayOf = (items: JsonSchema): JsonSchema => ({ type: 'array', items })
const level: JsonSchema = { type: 'integer' }

const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  propertyOrdering: Object.keys(properties),
})

export const communityPlanSchema: JsonSchema = object({
  schema_version: { type: 'string' },
  taxonomy_version: { type: 'string' },
  community_id: { type: 'string' },
  plan_id: { type: 'string' },

  summary: { type: 'string' },
  archetype: enumOf(ARCHETYPE),
  identity_tags: arrayOf(enumOf(IDENTITY_TAG)),

  density: level,
  height_profile: enumOf(HEIGHT_PROFILE),
  building_composition: object(
    Object.fromEntries(BUILDING_CATEGORIES.map((c) => [c, { type: 'integer' }])),
  ),

  vegetation: object({
    level,
    types: arrayOf(enumOf(VEGETATION_TYPE)),
  }),

  activity: object({
    pedestrian_density: level,
    crowd_clusters: level,
    vehicle_traffic: level,
    behaviors: arrayOf(enumOf(BEHAVIOR)),
  }),

  decorations: arrayOf(object({
    tag: enumOf(DECORATION),
    prominence: { type: 'integer' },
  })),

  mood: enumOf(MOOD),
  palette: enumOf(PALETTE),
  lighting: object({
    signature_time: enumOf(['dawn', 'day', 'golden_hour', 'dusk', 'night']),
    intensity: level,
    color_temp: enumOf(['warm', 'neutral', 'cool']),
    accents: arrayOf(enumOf(LIGHTING_ACCENT)),
  }),
  effects: arrayOf(enumOf(EFFECT)),
  // The API subset has no union type, so hero_asset is a nullable object
  // rather than `object | null`. docs/03 rule 9 makes it rare anyway.
  hero_asset: {
    ...object({ tag: enumOf(HERO_ASSET), prominence: { type: 'integer' } }),
    nullable: true,
  },

  stability: object({
    change_magnitude: enumOf(['none', 'minor', 'moderate', 'major']),
    retained_from_previous: arrayOf({ type: 'string' }),
    reasons: arrayOf({ type: 'string' }),
  }),
  confidence: { type: 'integer' },
})
