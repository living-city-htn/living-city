import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ACTIVITY_TYPE, ARCHETYPE, BEHAVIOR, BUILDING_CATEGORIES, CONTENT_FLAG,
  DECORATION, DOMINANT_ZONING, EFFECT, HEIGHT_PROFILE, HERO_ASSET, IDENTITY_TAG,
  INCIDENT_TYPE, LIGHTING_ACCENT, MOOD, PALETTE, PLACE_TYPE, VEGETATION_TYPE,
  assetTaxonomy, type AssetTaxonomy,
} from '@living-city/contracts'
import { env } from './env'
import { log } from './log'

/**
 * The taxonomy block passed into both prompts. docs/03 section 5.4.
 *
 * 3D owns `taxonomy.v1.json`, generated from the asset manifest. Until it
 * lands, the Pipeline contract (docs/roles/pipeline.md) says to hand-write a
 * minimal one from docs/03 section 5.3 and keep going, which is what
 * FALLBACK_TAXONOMY is. It is built from the enums in `packages/contracts`
 * rather than retyped, so the two cannot drift; only the controlled tag list
 * and the zoning defaults are written out here, because docs/03 puts both in
 * the taxonomy file rather than in the enums.
 *
 * When 3D's file appears, set TAXONOMY_PATH or drop it at one of
 * CANDIDATE_PATHS and this module picks it up with no code change.
 */

export const TAXONOMY_VERSION = '1.0'
export const SCHEMA_VERSION = '1.0' as const

/**
 * Controlled tags for Call A. docs/03 section 5.1 calls its own list
 * "representative; full list in the taxonomy file" - this is that list. A tag
 * outside it is dropped by the Call A validator, never invented (rule 22).
 */
export const CONTROLLED_TAGS = [
  'coffee', 'brunch', 'late_night', 'live_music', 'street_art', 'mural',
  'farmers_market', 'food_truck', 'patio', 'dog_walking', 'running', 'cycling',
  'skateboarding', 'students', 'tourists', 'families', 'crowded', 'quiet',
  'cozy', 'historic', 'modern', 'waterfront', 'garden', 'playground',
  'festival', 'sports_game', 'construction', 'traffic', 'rain', 'snow',
  'sunset', 'holiday_decor', 'pop_up', 'coworking', 'gallery', 'theatre',
  'library', 'campus', 'cleanup', 'protest_or_rally', 'night_out',
] as const

const composition = (
  residential: number, retail: number, cafe_bar: number,
  office: number, cultural_civic: number, campus_industrial: number,
) => ({ residential, retail, cafe_bar, office, cultural_civic, campus_industrial })

/**
 * Fallback plan fragments by `land_use_hints.dominant_zoning`.
 *
 * Used in exactly two places, both of them "we have nothing": Call B rule 8
 * (composition when data_sufficiency is none) and rule 14 / example 6.6 (no
 * posts and no previous plan). Deliberately dull, so that a block with real
 * posts reads as alive next to one without.
 */
const ZONING_DEFAULTS: Record<string, Record<string, unknown>> = {
  residential: {
    archetype: 'residential_quiet', identity_tags: ['family', 'brick'],
    density: 2, height_profile: 'low',
    building_composition: composition(75, 10, 5, 0, 10, 0),
    vegetation: { level: 3, types: ['street_trees', 'hedges'] },
    mood: 'serene', palette: 'warm_pastel',
  },
  commercial: {
    archetype: 'commercial_core', identity_tags: ['modern', 'glass'],
    density: 4, height_profile: 'mid',
    building_composition: composition(15, 40, 15, 25, 5, 0),
    vegetation: { level: 1, types: ['planters'] },
    mood: 'busy', palette: 'soft_grey',
  },
  mixed: {
    archetype: 'mixed_use_default', identity_tags: ['brick', 'modern'],
    density: 3, height_profile: 'low_mid',
    building_composition: composition(40, 25, 20, 10, 5, 0),
    vegetation: { level: 2, types: ['street_trees', 'planters'] },
    mood: 'focused', palette: 'default_city',
  },
  industrial: {
    archetype: 'maker_industrial', identity_tags: ['industrial', 'minimal'],
    density: 2, height_profile: 'low',
    building_composition: composition(5, 10, 5, 15, 0, 65),
    vegetation: { level: 1, types: ['wild_meadow'] },
    mood: 'gritty', palette: 'soft_grey',
  },
  institutional: {
    archetype: 'civic_center', identity_tags: ['historic', 'minimal'],
    density: 3, height_profile: 'low_mid',
    building_composition: composition(10, 10, 10, 20, 50, 0),
    vegetation: { level: 3, types: ['park_lawn', 'mature_trees'] },
    mood: 'focused', palette: 'soft_grey',
  },
  green: {
    archetype: 'green_retreat', identity_tags: ['family', 'wood'],
    density: 1, height_profile: 'low',
    building_composition: composition(40, 10, 20, 0, 30, 0),
    vegetation: { level: 5, types: ['mature_trees', 'park_lawn', 'wild_meadow'] },
    mood: 'serene', palette: 'earthy_green',
  },
  unknown: {
    archetype: 'mixed_use_default', identity_tags: ['minimal', 'modern'],
    density: 2, height_profile: 'low',
    building_composition: composition(50, 20, 15, 5, 10, 0),
    vegetation: { level: 2, types: ['street_trees'] },
    mood: 'serene', palette: 'default_city',
  },
}

export const FALLBACK_TAXONOMY: AssetTaxonomy = {
  version: TAXONOMY_VERSION,
  enums: {
    // Call A
    activity_type: [...ACTIVITY_TYPE],
    place_type: [...PLACE_TYPE],
    content_flags: [...CONTENT_FLAG],
    incident_type: [...INCIDENT_TYPE],
    tags: [...CONTROLLED_TAGS],
    // Call B
    archetype: [...ARCHETYPE],
    mood: [...MOOD],
    palette: [...PALETTE],
    identity_tags: [...IDENTITY_TAG],
    height_profile: [...HEIGHT_PROFILE],
    building_categories: [...BUILDING_CATEGORIES],
    vegetation_types: [...VEGETATION_TYPE],
    behaviors: [...BEHAVIOR],
    decorations: [...DECORATION],
    lighting_accents: [...LIGHTING_ACCENT],
    effects: [...EFFECT],
    hero_asset: [...HERO_ASSET],
    dominant_zoning: [...DOMINANT_ZONING],
  },
  zoning_defaults: ZONING_DEFAULTS,
}

const CANDIDATE_PATHS = [
  'packages/modeling/data/taxonomy.v1.json',
  'packages/fixtures/data/taxonomy.v1.json',
  'packages/pipeline/data/taxonomy.v1.json',
]

let cached: AssetTaxonomy | null = null

/**
 * 3D's taxonomy if it exists, the fallback otherwise. Cached because the
 * taxonomy sits in the fixed prompt prefix and must be byte-identical between
 * calls for prompt caching to hit (docs/03 section 9).
 */
export const loadTaxonomy = (): AssetTaxonomy => {
  if (cached) return cached
  const paths = [env.taxonomyPath(), ...CANDIDATE_PATHS].filter((p): p is string => !!p)
  for (const path of paths) {
    let raw: string
    try {
      raw = readFileSync(resolve(path), 'utf8')
    } catch {
      continue // Missing file is the normal case until 3D lands theirs.
    }
    const parsed = assetTaxonomy.safeParse(JSON.parse(raw))
    if (parsed.success) {
      log.info('taxonomy.loaded', { path, version: parsed.data.version })
      cached = parsed.data
      return cached
    }
    log.warn('taxonomy.invalid', { path, issue: parsed.error.issues[0]?.message })
  }
  log.info('taxonomy.fallback', { version: FALLBACK_TAXONOMY.version })
  cached = FALLBACK_TAXONOMY
  return cached
}

/** Tests and the emit script need a clean slate. */
export const resetTaxonomyCache = (): void => { cached = null }

/** The allowed value set for one enum key, for the validators. */
export const allowed = (taxonomy: AssetTaxonomy, key: string): ReadonlySet<string> =>
  new Set(taxonomy.enums[key] ?? [])

export const zoningDefault = (
  taxonomy: AssetTaxonomy,
  zoning: string,
): Record<string, unknown> =>
  taxonomy.zoning_defaults[zoning]
  ?? taxonomy.zoning_defaults.unknown
  ?? ZONING_DEFAULTS.unknown as Record<string, unknown>
