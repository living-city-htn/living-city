import { z } from 'zod'

/**
 * Every controlled vocabulary in docs/03 section 5, as const tuples plus Zod enums.
 *
 * The tuples are exported so the taxonomy generator (3D) and the validator
 * (Pipeline) can iterate them without duplicating the lists. If a list here
 * disagrees with docs/03, docs/03 wins and this file is the bug.
 */

const e = <T extends readonly [string, ...string[]]>(values: T) =>
  ({ values, schema: z.enum(values) }) as const

// ---- Call A, docs/03 section 5.1 -------------------------------------------

export const ACTIVITY_TYPE = [
  'eating', 'drinking', 'shopping', 'working', 'studying', 'exercising',
  'commuting', 'relaxing', 'socializing', 'performing', 'creating',
  'sightseeing', 'attending_event', 'unknown',
] as const
export const activityType = z.enum(ACTIVITY_TYPE)

export const PLACE_TYPE = [
  'cafe', 'restaurant', 'bar', 'park', 'street', 'plaza', 'shop', 'office',
  'school', 'home', 'transit', 'venue', 'waterfront', 'market', 'gym', 'unknown',
] as const
export const placeType = z.enum(PLACE_TYPE)

export const CONTENT_FLAG = [
  'spam', 'advertising', 'not_about_place', 'unsafe', 'unclear',
  'image_only', 'image_missing', 'no_community', 'instruction_like', 'empty',
] as const
export const contentFlag = z.enum(CONTENT_FLAG)

export const INCIDENT_TYPE = [
  'none', 'flooding', 'fallen_tree', 'road_blocked', 'power_outage', 'fire',
  'accident', 'infrastructure_damage', 'snow_ice', 'sanitation',
  'safety_concern', 'noise', 'other',
] as const
export const incidentType = z.enum(INCIDENT_TYPE)

/**
 * The four incident types that get a distinct label in the UI this weekend.
 * Everything else renders as "other". docs/04 section 3.
 */
export const DEMO_INCIDENT_TYPES = ['flooding', 'fallen_tree', 'road_blocked', 'power_outage'] as const

export const temporalScope = z.enum(['moment', 'recurring', 'persistent', 'unknown'])
export const eventScale = z.enum(['none', 'small', 'medium', 'large'])
export const incidentEvidence = z.enum(['observed', 'heard', 'form', 'none'])

// ---- Call B, docs/03 section 5.3 -------------------------------------------

export const ARCHETYPE = [
  'residential_quiet', 'residential_lively', 'commercial_core',
  'nightlife_district', 'creative_quarter', 'green_retreat', 'campus_hub',
  'waterfront_leisure', 'civic_center', 'transit_hub', 'maker_industrial',
  'market_street', 'mixed_use_default',
] as const
export const archetype = z.enum(ARCHETYPE)

export const MOOD = [
  'cozy', 'vibrant', 'serene', 'busy', 'gritty', 'festive', 'melancholic',
  'focused', 'playful', 'elegant',
] as const
export const mood = z.enum(MOOD)

export const PALETTE = [
  'warm_pastel', 'cool_pastel', 'neon_night', 'earthy_green', 'soft_grey',
  'sunset_orange', 'ocean_blue', 'brick_red', 'candy_pop', 'default_city',
] as const
export const palette = z.enum(PALETTE)

export const VEGETATION_TYPE = [
  'street_trees', 'mature_trees', 'park_lawn', 'flower_beds',
  'hedges', 'wild_meadow', 'planters', 'rooftop_green',
] as const
export const vegetationType = z.enum(VEGETATION_TYPE)

export const BEHAVIOR = [
  'walking', 'sitting', 'jogging', 'dancing', 'cycling', 'dining',
  'shopping', 'performing', 'dog_walking', 'skateboarding', 'studying', 'queueing',
] as const
export const behavior = z.enum(BEHAVIOR)

export const DECORATION = [
  'string_lights', 'banners', 'mural', 'sculpture', 'fountain', 'food_trucks',
  'market_stalls', 'benches', 'bike_racks', 'neon_signs', 'outdoor_seating',
  'playground', 'sports_court', 'stage', 'kiosks', 'flags', 'lanterns',
  'graffiti', 'construction_barriers', 'bus_shelter',
] as const
export const decoration = z.enum(DECORATION)

export const LIGHTING_ACCENT = [
  'streetlamps_warm', 'streetlamps_cool', 'window_glow', 'neon',
  'string_lights', 'lanterns', 'spotlights',
] as const
export const lightingAccent = z.enum(LIGHTING_ACCENT)

export const EFFECT = [
  'fireflies', 'confetti', 'music_notes', 'falling_leaves', 'rain', 'snow',
  'fog', 'sparkles', 'steam', 'birds', 'fireworks', 'heart_particles',
] as const
export const effect = z.enum(EFFECT)

export const HERO_ASSET = [
  'clock_tower', 'stadium', 'ferris_wheel', 'museum', 'market_hall',
  'concert_hall', 'giant_tree', 'fountain_plaza', 'lighthouse',
  'university_hall', 'transit_station', 'observation_deck',
] as const
export const heroAsset = z.enum(HERO_ASSET)

export const IDENTITY_TAG = [
  'modern', 'historic', 'brick', 'glass', 'wood', 'colorful',
  'minimal', 'industrial', 'cozy', 'upscale', 'student',
  'family', 'tourist', 'bohemian',
] as const
export const identityTag = z.enum(IDENTITY_TAG)

export const HEIGHT_PROFILE = ['low', 'low_mid', 'mid', 'mid_high', 'high'] as const
export const heightProfile = z.enum(HEIGHT_PROFILE)
/** height_profile as a 1-5 tier, for comparison against capacity.max_height_tier. */
export const heightTier = (h: (typeof HEIGHT_PROFILE)[number]) => HEIGHT_PROFILE.indexOf(h) + 1

export const signatureTime = z.enum(['dawn', 'day', 'golden_hour', 'dusk', 'night'])
export const colorTemp = z.enum(['warm', 'neutral', 'cool'])
export const changeMagnitude = z.enum(['none', 'minor', 'moderate', 'major'])

export const DOMINANT_ZONING = [
  'residential', 'commercial', 'mixed', 'industrial', 'institutional', 'green', 'unknown',
] as const
export const dominantZoning = z.enum(DOMINANT_ZONING)

export const bearing = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'CENTER'])
export const dataSufficiency = z.enum(['none', 'low', 'medium', 'high'])
export const geoSource = z.enum(['admin', 'neighborhood', 'synthetic'])

/** The eleven dimensions shared by both calls. docs/03 section 5.2. */
export const DIMENSIONS = [
  'energy', 'social', 'creativity', 'stress', 'calm', 'nature',
  'nightlife', 'food', 'commerce', 'culture', 'fitness',
] as const
export type DimensionName = (typeof DIMENSIONS)[number]

/** Building composition categories. Integers, must sum to 100. */
export const BUILDING_CATEGORIES = [
  'residential', 'retail', 'cafe_bar', 'office', 'cultural_civic', 'campus_industrial',
] as const

void e
