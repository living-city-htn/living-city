import {
  BUILDING_CATEGORIES, HEIGHT_PROFILE, communityPlan, heightTier,
  type AssetTaxonomy, type BuildingComposition, type CommunityGeo, type CommunityPlan,
} from '@living-city/contracts'
import { correction, type CorrectionLog } from '../log'
import { allowed, zoningDefault } from '../taxonomy'

/**
 * The Validator. docs/02 section 4.4, docs/03 section 7.
 *
 * This is the safety net and it is never cut (docs/roles/pipeline.md). Its
 * promise: a prompt bug can produce a clamped plan or a rejected one, never a
 * broken city. Everything it changes is logged and stored with the plan as
 * `validator_log`, because a rising correction rate is the first sign a prompt
 * edit went wrong.
 *
 * Rejection is different from correction. A rejected plan means the caller
 * keeps the previous one; there is no half-accepted plan.
 */

export type ValidateContext = {
  geo: CommunityGeo
  taxonomy: AssetTaxonomy
  previousPlan: CommunityPlan | null
  dataSufficiency: 'none' | 'low' | 'medium' | 'high'
  consecutiveWindowsSupportingChange: number
  /** Caller-supplied, so the plan id is deterministic rather than model-chosen. */
  planId: string
}

export type ValidateResult =
  | { ok: true; plan: CommunityPlan; log: CorrectionLog }
  | { ok: false; reason: string; log: CorrectionLog }

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const int = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/** Every key the plan is allowed to carry. docs/03 section 7: strip the rest. */
const PLAN_KEYS = new Set([
  'schema_version', 'taxonomy_version', 'community_id', 'plan_id', 'summary',
  'archetype', 'identity_tags', 'density', 'height_profile', 'building_composition',
  'vegetation', 'activity', 'decorations', 'mood', 'palette', 'lighting',
  'effects', 'hero_asset', 'stability', 'confidence',
])

const normaliseComposition = (
  raw: unknown, log: CorrectionLog, label = 'building_composition',
): BuildingComposition => {
  const source = obj(raw)
  const values = BUILDING_CATEGORIES.map((c) => Math.max(0, int(source[c], 0, 100, 0)))
  let total = values.reduce((a, b) => a + b, 0)

  if (total === 0) {
    // Nothing usable. An even split is wrong in every direction equally, which
    // is the right kind of wrong for a fallback.
    correction(log, `${label}: all zero, split evenly`)
    const share = Math.floor(100 / BUILDING_CATEGORIES.length)
    const even = BUILDING_CATEGORIES.map(() => share)
    even[0] = (even[0] ?? 0) + (100 - share * BUILDING_CATEGORIES.length)
    return Object.fromEntries(
      BUILDING_CATEGORIES.map((c, i) => [c, even[i] ?? 0]),
    ) as BuildingComposition
  }

  if (total !== 100) {
    correction(log, `${label}: summed to ${total}, normalised to 100`)
    const scaled = values.map((v) => Math.round((v / total) * 100))
    total = scaled.reduce((a, b) => a + b, 0)
    // Rounding drift lands on the largest category so the sum is exactly 100.
    let largest = 0
    for (let i = 1; i < scaled.length; i++) {
      if ((scaled[i] ?? 0) > (scaled[largest] ?? 0)) largest = i
    }
    scaled[largest] = (scaled[largest] ?? 0) + (100 - total)
    return Object.fromEntries(
      BUILDING_CATEGORIES.map((c, i) => [c, Math.max(0, scaled[i] ?? 0)]),
    ) as BuildingComposition
  }

  return Object.fromEntries(
    BUILDING_CATEGORIES.map((c, i) => [c, values[i] ?? 0]),
  ) as BuildingComposition
}

/**
 * docs/02 section 4.4: composition may shift at most 15 points per window.
 * "Points" counts the categories that went up - docs/03 example 6.4 calls
 * moving 5 from retail to cafe_bar "shifted 5 points", not 10.
 */
const capCompositionDelta = (
  next: BuildingComposition,
  previous: BuildingComposition,
  log: CorrectionLog,
  limit = 15,
): BuildingComposition => {
  const deltas = BUILDING_CATEGORIES.map((c) => next[c] - previous[c])
  const moved = deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0)
  if (moved <= limit) return next

  correction(log, `building_composition: shift of ${moved} points scaled back to ${limit}`)
  const factor = limit / moved
  const scaled = BUILDING_CATEGORIES.map(
    (c, i) => previous[c] + (deltas[i] ?? 0) * factor,
  )
  const rounded = scaled.map((v) => Math.max(0, Math.round(v)))
  const total = rounded.reduce((a, b) => a + b, 0)
  let largest = 0
  for (let i = 1; i < rounded.length; i++) {
    if ((rounded[i] ?? 0) > (rounded[largest] ?? 0)) largest = i
  }
  rounded[largest] = (rounded[largest] ?? 0) + (100 - total)
  return Object.fromEntries(
    BUILDING_CATEGORIES.map((c, i) => [c, Math.max(0, rounded[i] ?? 0)]),
  ) as BuildingComposition
}

export const validateCommunityPlan = (
  raw: unknown,
  context: ValidateContext,
  log: CorrectionLog = [],
): ValidateResult => {
  const { geo, taxonomy, previousPlan } = context
  const source = obj(raw)

  if (Object.keys(source).length === 0) {
    return { ok: false, reason: 'plan was not an object', log }
  }

  // docs/03 rule 20: the model may say the input was unusable. That is a valid
  // answer, and the answer is to keep the previous plan.
  if (typeof source.error === 'string') {
    return {
      ok: false,
      reason: `model returned error: ${source.error} (${String(source.detail ?? '')})`,
      log,
    }
  }

  // Hard failure, docs/03 section 7: a plan for the wrong block is not a plan.
  if (source.community_id !== geo.community_id) {
    return {
      ok: false,
      reason: `community_id mismatch: expected ${geo.community_id}, got ${JSON.stringify(source.community_id)}`,
      log,
    }
  }

  // A plan built against a different asset library would reference assets that
  // do not exist. docs/03 section 4.3: reject rather than guess.
  if (typeof source.taxonomy_version === 'string' && source.taxonomy_version !== taxonomy.version) {
    return {
      ok: false,
      reason: `taxonomy_version mismatch: expected ${taxonomy.version}, got ${source.taxonomy_version}`,
      log,
    }
  }

  for (const key of Object.keys(source)) {
    if (!PLAN_KEYS.has(key)) {
      correction(log, `stripped unknown top-level key "${key}"`)
      delete source[key]
    }
  }
  if (source.schema_version !== '1.0') {
    correction(log, `schema_version: expected "1.0", got ${JSON.stringify(source.schema_version)}`)
  }

  const fallback = zoningDefault(taxonomy, geo.land_use_hints.dominant_zoning)

  /** previous plan first, then the zoning default, then a hard constant. */
  const pick = (
    value: unknown, key: string, enumKey: string, constant: string,
  ): string => {
    const set = allowed(taxonomy, enumKey)
    if (typeof value === 'string' && set.has(value)) return value
    const previous = previousPlan ? (previousPlan as unknown as Record<string, unknown>)[key] : undefined
    const chosen = (typeof previous === 'string' && set.has(previous))
      ? previous
      : (typeof fallback[key] === 'string' && set.has(fallback[key] as string))
        ? fallback[key] as string
        : constant
    correction(log, `${key}: dropped ${JSON.stringify(value)}, used "${chosen}"`)
    return chosen
  }

  const filterEnum = (value: unknown, enumKey: string, field: string, cap: number): string[] => {
    const set = allowed(taxonomy, enumKey)
    const kept: string[] = []
    for (const item of stringsOf(value)) {
      if (set.has(item)) {
        if (!kept.includes(item)) kept.push(item)
      } else {
        correction(log, `${field}: dropped unknown value "${item}"`)
      }
    }
    if (kept.length > cap) {
      correction(log, `${field}: trimmed ${kept.length} entries to ${cap}`)
    }
    return kept.slice(0, cap)
  }

  // ---- archetype, the one field with a change gate -------------------------

  let archetype = pick(source.archetype, 'archetype', 'archetype', 'mixed_use_default')
  const retained = new Set(stringsOf(obj(source.stability).retained_from_previous))

  if (previousPlan && archetype !== previousPlan.archetype) {
    const enoughWindows = context.consecutiveWindowsSupportingChange >= 2
    const enoughData = context.dataSufficiency === 'medium' || context.dataSufficiency === 'high'
    if (!enoughWindows || !enoughData) {
      correction(
        log,
        `archetype: reverted to "${previousPlan.archetype}" (${context.consecutiveWindowsSupportingChange} supporting windows, sufficiency ${context.dataSufficiency})`,
      )
      archetype = previousPlan.archetype
      retained.add('archetype')
    }
  }

  // ---- identity tags need at least two ------------------------------------

  const identityTags = filterEnum(source.identity_tags, 'identity_tags', 'identity_tags', 4)
  if (identityTags.length < 2) {
    const donors = [
      ...(previousPlan?.identity_tags ?? []),
      ...(Array.isArray(fallback.identity_tags) ? fallback.identity_tags as string[] : []),
      'minimal', 'modern',
    ]
    for (const tag of donors) {
      if (identityTags.length >= 2) break
      if (allowed(taxonomy, 'identity_tags').has(tag) && !identityTags.includes(tag)) {
        identityTags.push(tag)
      }
    }
    correction(log, `identity_tags: padded to ${identityTags.length} (minimum is 2)`)
  }

  // ---- density and height, one step per window, capped by the silhouette ---

  let density = int(source.density, 1, 5, previousPlan?.density ?? 2)
  if (previousPlan && Math.abs(density - previousPlan.density) > 1) {
    const clamped = previousPlan.density + Math.sign(density - previousPlan.density)
    correction(log, `density: ${density} is more than one step from ${previousPlan.density}, clamped to ${clamped}`)
    density = clamped
  }

  let heightProfile = pick(source.height_profile, 'height_profile', 'height_profile', 'low')
  if (previousPlan) {
    const from = HEIGHT_PROFILE.indexOf(previousPlan.height_profile)
    const to = HEIGHT_PROFILE.indexOf(heightProfile as (typeof HEIGHT_PROFILE)[number])
    if (from >= 0 && to >= 0 && Math.abs(to - from) > 1) {
      const stepped = HEIGHT_PROFILE[from + Math.sign(to - from)]
      if (stepped) {
        correction(log, `height_profile: ${heightProfile} is more than one step from ${previousPlan.height_profile}, clamped to ${stepped}`)
        heightProfile = stepped
      }
    }
  }
  // docs/03 rule 2: the block may never out-rise its capacity. This runs last
  // so the step clamp above cannot reintroduce a too-tall value.
  if (heightTier(heightProfile as (typeof HEIGHT_PROFILE)[number]) > geo.capacity.max_height_tier) {
    const capped = HEIGHT_PROFILE[geo.capacity.max_height_tier - 1] ?? 'low'
    correction(log, `height_profile: ${heightProfile} exceeds capacity tier ${geo.capacity.max_height_tier}, clamped to ${capped}`)
    heightProfile = capped
  }

  // ---- building composition ------------------------------------------------

  let composition = normaliseComposition(source.building_composition, log)
  if (previousPlan) {
    composition = capCompositionDelta(composition, previousPlan.building_composition, log)
  }

  // ---- everything atmospheric ---------------------------------------------

  const vegetationRaw = obj(source.vegetation)
  const activityRaw = obj(source.activity)
  const lightingRaw = obj(source.lighting)
  const stabilityRaw = obj(source.stability)

  const decorations = (Array.isArray(source.decorations) ? source.decorations : [])
    .map((entry) => {
      const item = obj(entry)
      const tag = typeof item.tag === 'string' ? item.tag : ''
      if (!allowed(taxonomy, 'decorations').has(tag)) {
        correction(log, `decorations: dropped unknown tag ${JSON.stringify(item.tag)}`)
        return null
      }
      return { tag, prominence: int(item.prominence, 1, 3, 1) }
    })
    .filter((d): d is { tag: string; prominence: number } => d !== null)
    .slice(0, 8)

  let heroAsset: { tag: string; prominence: number } | null = null
  if (source.hero_asset !== null && source.hero_asset !== undefined) {
    const item = obj(source.hero_asset)
    const tag = typeof item.tag === 'string' ? item.tag : ''
    if (allowed(taxonomy, 'hero_asset').has(tag)) {
      heroAsset = { tag, prominence: int(item.prominence, 1, 3, 1) }
    } else if (Object.keys(item).length > 0) {
      // docs/03 section 7: an invented landmark cannot pass, because the enum
      // holds generic types only.
      correction(log, `hero_asset: dropped unknown tag ${JSON.stringify(item.tag)}`)
    }
  }

  const reasons = stringsOf(stabilityRaw.reasons)
    .map((r) => r.slice(0, 80))
    .filter((r) => r.length > 0)
    .slice(0, 3)
  if (reasons.length === 0) {
    correction(log, 'stability.reasons: empty, substituted a generic reason')
    reasons.push(`${context.dataSufficiency} data over ${geo.name}; no reason given by the planner`.slice(0, 80))
  }

  const summary = typeof source.summary === 'string' ? source.summary.slice(0, 200) : ''
  if (typeof source.summary === 'string' && source.summary.length > 200) {
    correction(log, `summary: truncated from ${source.summary.length} to 200 characters`)
  }

  const candidate = {
    schema_version: '1.0' as const,
    taxonomy_version: taxonomy.version,
    community_id: geo.community_id,
    // Deterministic and caller-owned: the model does not get to name plans.
    plan_id: context.planId,
    summary: summary || `${geo.name} holds its shape.`,
    archetype,
    identity_tags: identityTags,
    density,
    height_profile: heightProfile,
    building_composition: composition,
    vegetation: {
      level: int(vegetationRaw.level, 0, 5, 1),
      types: filterEnum(vegetationRaw.types, 'vegetation_types', 'vegetation.types', 4),
    },
    activity: {
      pedestrian_density: int(activityRaw.pedestrian_density, 0, 5, 1),
      crowd_clusters: int(activityRaw.crowd_clusters, 0, 5, 0),
      vehicle_traffic: int(activityRaw.vehicle_traffic, 0, 5, 1),
      behaviors: filterEnum(activityRaw.behaviors, 'behaviors', 'activity.behaviors', 5),
    },
    decorations,
    mood: pick(source.mood, 'mood', 'mood', 'serene'),
    palette: pick(source.palette, 'palette', 'palette', 'default_city'),
    lighting: {
      signature_time: ['dawn', 'day', 'golden_hour', 'dusk', 'night']
        .includes(String(lightingRaw.signature_time))
        ? String(lightingRaw.signature_time)
        : 'day',
      intensity: int(lightingRaw.intensity, 0, 5, 3),
      color_temp: ['warm', 'neutral', 'cool'].includes(String(lightingRaw.color_temp))
        ? String(lightingRaw.color_temp)
        : 'neutral',
      accents: filterEnum(lightingRaw.accents, 'lighting_accents', 'lighting.accents', 4),
    },
    effects: filterEnum(source.effects, 'effects', 'effects', 3),
    hero_asset: heroAsset,
    stability: {
      change_magnitude: ['none', 'minor', 'moderate', 'major']
        .includes(String(stabilityRaw.change_magnitude))
        ? String(stabilityRaw.change_magnitude)
        : 'minor',
      retained_from_previous: [...retained],
      reasons,
    },
    confidence: int(source.confidence, 0, 100, 40),
  }

  const parsed = communityPlan.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      correction(log, `schema: ${issue.path.join('.')} ${issue.message}`)
    }
    return { ok: false, reason: 'plan failed schema validation after correction', log }
  }

  return { ok: true, plan: parsed.data, log }
}
