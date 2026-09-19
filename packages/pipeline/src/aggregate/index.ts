import {
  ARCHETYPE, DIMENSIONS, type CommunityGeo, type PostAnalysis, type SemanticState,
} from '@living-city/contracts'
import { env } from '../env'
import { buildTimeContext } from '../time-context'
import { postWeight } from './weights'

export * from './weights'

/**
 * The aggregator. docs/02 section 4.3, docs/03 section 2.3.
 *
 * Deterministic code, not AI. It owns weighting, decay, baseline maintenance
 * and `consecutive_windows_supporting_change`, so all of that can be tuned at
 * the venue without touching a prompt (docs/03 section 9).
 *
 * The single most important rule here is null-aware averaging: a dimension
 * without evidence is excluded from the mean, never counted as zero. "Null
 * beats guess" (docs/03 principle 4) only works if it survives aggregation.
 */

export type AggregatablePost = {
  post_id: string
  user_id: string
  created_at: string
  hidden: boolean
  status: 'pending' | 'analyzed'
  analysis: PostAnalysis
  /** likes + 2 x comments, at aggregation time. */
  engagement?: number
}

export type WindowSummary = {
  start: string
  end: string
  post_count: number
  distinct_authors: number
  data_sufficiency: 'none' | 'low' | 'medium' | 'high'
}

export type AggregateResult = {
  window: WindowSummary
  current: SemanticState
  /** Sum of post weights. Near zero means the window is effectively empty. */
  total_weight: number
  /** Which posts actually counted, for the "why" panel. */
  contributing_post_ids: string[]
}

const EMPTY_STATE = (): SemanticState => ({
  dimensions: Object.fromEntries(
    DIMENSIONS.map((d) => [d, null]),
  ) as SemanticState['dimensions'],
  valence: null,
  top_tags: [],
  top_keywords: [],
  activity_mix: {},
  place_mix: {},
  time_mix: { morning: 0, afternoon: 0, evening: 0, night: 0 },
  temporal_mix: { moment: 0, recurring: 0, persistent: 0 },
})

const round = (value: number, places = 3): number => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Weighted shares over a tally, largest first, capped, and renormalised. */
const shares = (
  tally: Map<string, number>, total: number, cap: number,
): Array<[string, number]> => {
  if (total <= 0) return []
  return [...tally.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([key, weight]) => [key, round(weight / total)] as [string, number])
}

/**
 * docs/02 section 4.3. Counts are of usable posts, not weight: five real posts
 * is `low` whether or not anyone liked them. The one weight-based case is the
 * failure row in docs/03 section 7 - a window that is all spam weighs nothing
 * and is treated as `none`.
 */
const sufficiencyOf = (
  postCount: number, authorCount: number, totalWeight: number,
): WindowSummary['data_sufficiency'] => {
  if (postCount === 0 || totalWeight < 0.01) return 'none'
  if (postCount <= 5 || authorCount < env.sufficiencyMinAuthors()) return 'low'
  if (postCount <= env.sufficiencyHigh()) return postCount >= env.sufficiencyMedium() ? 'medium' : 'low'
  return 'high'
}

export type AggregateOptions = {
  now?: Date
  windowStart?: Date | string
  windowEnd?: Date | string
  timeZone?: string
}

/**
 * Collapse one community's analysed posts into the `SemanticState` Call B
 * reads. Hidden and pending posts are excluded before anything else, as are
 * posts flagged `unsafe` (their weight is 0).
 */
export const aggregateCommunity = (
  posts: readonly AggregatablePost[],
  options: AggregateOptions = {},
): AggregateResult => {
  const now = options.now ?? new Date()
  const usable = posts.filter((p) => !p.hidden && p.status === 'analyzed')

  const weighted = usable
    .map((post) => ({
      post,
      weight: postWeight(post.analysis, {
        createdAt: post.created_at,
        engagement: post.engagement,
        now,
      }),
    }))
    .filter((entry) => entry.weight > 0)

  const totalWeight = weighted.reduce((sum, e) => sum + e.weight, 0)

  const timestamps = usable
    .map((p) => new Date(p.created_at).getTime())
    .filter((t) => !Number.isNaN(t))
  const start = options.windowStart
    ? new Date(options.windowStart)
    : new Date(timestamps.length ? Math.min(...timestamps) : now.getTime())
  const end = options.windowEnd
    ? new Date(options.windowEnd)
    : new Date(timestamps.length ? Math.max(...timestamps) : now.getTime())

  const window: WindowSummary = {
    start: start.toISOString(),
    end: end.toISOString(),
    post_count: usable.length,
    distinct_authors: new Set(usable.map((p) => p.user_id)).size,
    data_sufficiency: sufficiencyOf(
      usable.length,
      new Set(usable.map((p) => p.user_id)).size,
      totalWeight,
    ),
  }

  if (weighted.length === 0) {
    return { window, current: EMPTY_STATE(), total_weight: 0, contributing_post_ids: [] }
  }

  // ---- null-aware dimension means ------------------------------------------
  const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => {
    let sum = 0
    let weight = 0
    for (const { post, weight: w } of weighted) {
      const value = post.analysis.dimensions[dimension]
      if (value === null || value === undefined) continue
      sum += value * w
      weight += w
    }
    return [dimension, weight > 0 ? Math.round(sum / weight) : null]
  })) as SemanticState['dimensions']

  let valenceSum = 0
  let valenceWeight = 0
  for (const { post, weight } of weighted) {
    if (post.analysis.valence === null) continue
    valenceSum += post.analysis.valence * weight
    valenceWeight += weight
  }

  // ---- mixes and vocabularies ----------------------------------------------
  const tagTally = new Map<string, number>()
  const keywordTally = new Map<string, number>()
  const activityTally = new Map<string, number>()
  const placeTally = new Map<string, number>()
  const timeTally = new Map<string, number>([
    ['morning', 0], ['afternoon', 0], ['evening', 0], ['night', 0],
  ])
  const temporalTally = new Map<string, number>([
    ['moment', 0], ['recurring', 0], ['persistent', 0],
  ])

  const add = (tally: Map<string, number>, key: string, weight: number) =>
    tally.set(key, (tally.get(key) ?? 0) + weight)

  let activityTotal = 0
  let placeTotal = 0
  let temporalTotal = 0

  for (const { post, weight } of weighted) {
    for (const tag of post.analysis.tags) add(tagTally, tag, weight)
    for (const keyword of post.analysis.keywords) add(keywordTally, keyword, weight)

    // "unknown" is not a category, it is the absence of one. Counting it would
    // make the mix look confident about nothing.
    if (post.analysis.activity_type !== 'unknown') {
      add(activityTally, post.analysis.activity_type, weight)
      activityTotal += weight
    }
    if (post.analysis.place_type !== 'unknown') {
      add(placeTally, post.analysis.place_type, weight)
      placeTotal += weight
    }
    if (post.analysis.temporal_scope !== 'unknown') {
      add(temporalTally, post.analysis.temporal_scope, weight)
      temporalTotal += weight
    }

    add(timeTally, buildTimeContext(post.created_at, options.timeZone).time_bucket, weight)
  }

  const mixOf = (tally: Map<string, number>, total: number, cap: number) =>
    Object.fromEntries(shares(tally, total, cap))

  const timeMix = mixOf(timeTally, totalWeight, 4)
  const temporalMix = mixOf(temporalTally, temporalTotal, 3)

  const current: SemanticState = {
    dimensions,
    valence: valenceWeight > 0 ? Math.round(valenceSum / valenceWeight) : null,
    top_tags: shares(tagTally, totalWeight, 10).map(([tag, share]) => ({ tag, share })),
    top_keywords: shares(keywordTally, totalWeight, 10).map(([kw, share]) => ({ kw, share })),
    activity_mix: mixOf(activityTally, activityTotal, 6),
    place_mix: mixOf(placeTally, placeTotal, 6),
    time_mix: {
      morning: timeMix.morning ?? 0,
      afternoon: timeMix.afternoon ?? 0,
      evening: timeMix.evening ?? 0,
      night: timeMix.night ?? 0,
    },
    temporal_mix: {
      moment: temporalMix.moment ?? 0,
      recurring: temporalMix.recurring ?? 0,
      persistent: temporalMix.persistent ?? 0,
    },
  }

  return {
    window,
    current,
    total_weight: round(totalWeight, 4),
    contributing_post_ids: weighted.map((e) => e.post.post_id),
  }
}

/**
 * The long-term profile: an exponential moving average over windows with a slow
 * alpha, so identity moves slowly while mood moves fast (docs/03 principle 5).
 * A dimension that is null in the new window keeps its old baseline rather than
 * decaying toward nothing.
 */
export const nextBaseline = (
  previous: SemanticState | null,
  current: SemanticState,
  alpha = env.baselineAlpha(),
): SemanticState => {
  if (!previous) return structuredClone(current)

  const blend = (a: number | null, b: number | null): number | null => {
    if (b === null) return a
    if (a === null) return b
    return Math.round(a * (1 - alpha) + b * alpha)
  }

  const dimensions = Object.fromEntries(DIMENSIONS.map((d) => [
    d, blend(previous.dimensions[d], current.dimensions[d]),
  ])) as SemanticState['dimensions']

  const blendShares = <T extends Record<string, number>>(a: T, b: T): T => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return Object.fromEntries(
      [...keys].map((k) => [k, round((a[k] ?? 0) * (1 - alpha) + (b[k] ?? 0) * alpha)]),
    ) as T
  }

  const blendList = <K extends string>(
    key: K,
    a: Array<Record<K, string> & { share: number }>,
    b: Array<Record<K, string> & { share: number }>,
  ) => {
    const map = new Map<string, number>()
    for (const item of a) map.set(item[key], (map.get(item[key]) ?? 0) + item.share * (1 - alpha))
    for (const item of b) map.set(item[key], (map.get(item[key]) ?? 0) + item.share * alpha)
    return [...map.entries()]
      .filter(([, share]) => share > 0.001)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 10)
      .map(([name, share]) => ({ [key]: name, share: round(share) }))
  }

  return {
    dimensions,
    valence: blend(previous.valence, current.valence),
    top_tags: blendList('tag', previous.top_tags, current.top_tags) as SemanticState['top_tags'],
    top_keywords: blendList('kw', previous.top_keywords, current.top_keywords) as SemanticState['top_keywords'],
    activity_mix: blendShares(previous.activity_mix, current.activity_mix),
    place_mix: blendShares(previous.place_mix, current.place_mix),
    time_mix: blendShares(previous.time_mix, current.time_mix),
    temporal_mix: blendShares(previous.temporal_mix, current.temporal_mix),
  }
}

/** current minus baseline, per dimension. A dimension with no data is absent. */
export const computeTrend = (
  current: SemanticState,
  baseline: SemanticState | null,
): Partial<Record<(typeof DIMENSIONS)[number], number>> => {
  const trend: Partial<Record<(typeof DIMENSIONS)[number], number>> = {}
  if (!baseline) return trend
  for (const dimension of DIMENSIONS) {
    const now = current.dimensions[dimension]
    const base = baseline.dimensions[dimension]
    if (now === null || base === null) continue
    trend[dimension] = Math.max(-100, Math.min(100, now - base))
  }
  return trend
}

/**
 * The dominant archetype the data points at, computed in code rather than
 * asked of the model. docs/02 section 4.3 needs it for
 * `consecutive_windows_supporting_change`, which is the counter that stops one
 * loud night from rewriting a neighbourhood's identity.
 *
 * Scores are deliberately coarse. This decides "has the signal changed", not
 * what the plan says - Call B still chooses the archetype it emits.
 */
export const archetypeSignal = (
  state: SemanticState,
  geo: Pick<CommunityGeo, 'land_use_hints'>,
): (typeof ARCHETYPE)[number] => {
  const d = (name: (typeof DIMENSIONS)[number]) => state.dimensions[name] ?? 0
  const tag = (name: string) => state.top_tags.find((t) => t.tag === name)?.share ?? 0
  const place = (name: string) => state.place_mix[name] ?? 0
  const hints = geo.land_use_hints

  const scores: Record<string, number> = {
    nightlife_district: d('nightlife') * 1.2 + tag('night_out') * 40 + tag('late_night') * 30,
    creative_quarter: d('creativity') + d('culture') * 0.6 + tag('street_art') * 50 + tag('mural') * 30,
    green_retreat: d('nature') * 1.2 + hints.park_ratio * 60 + place('park') * 40,
    campus_hub: (hints.campus ? 45 : 0) + tag('students') * 40 + tag('campus') * 40 + d('creativity') * 0.2,
    waterfront_leisure: (hints.water_adjacent ? 35 : 0) + tag('waterfront') * 50 + place('waterfront') * 40,
    commercial_core: d('commerce') * 1.1 + place('shop') * 30 + (hints.dominant_zoning === 'commercial' ? 25 : 0),
    market_street: tag('farmers_market') * 60 + place('market') * 50 + d('commerce') * 0.4,
    civic_center: d('culture') * 0.9 + (hints.dominant_zoning === 'institutional' ? 40 : 0),
    transit_hub: Math.min(3, hints.transit_stations) * 18 + place('transit') * 40,
    maker_industrial: (hints.dominant_zoning === 'industrial' ? 55 : 0) + tag('construction') * 20,
    residential_lively: (hints.dominant_zoning === 'residential' ? 25 : 0) + d('social') * 0.6 + d('energy') * 0.5,
    residential_quiet: (hints.dominant_zoning === 'residential' ? 30 : 0) + d('calm') * 0.6 - d('energy') * 0.3,
    mixed_use_default: 30,
  }

  // Ties break on the enum order, so the same state always yields the same
  // signal. Determinism is a feature (docs/03 principle 7).
  let best: (typeof ARCHETYPE)[number] = 'mixed_use_default'
  let bestScore = -Infinity
  for (const name of ARCHETYPE) {
    const score = scores[name] ?? 0
    if (score > bestScore) {
      bestScore = score
      best = name
    }
  }
  return best
}

/**
 * docs/02 section 4.3: the number of consecutive windows whose dominant
 * archetype signal differs from the current plan's archetype. Call B may only
 * change archetype once this reaches 2 (docs/03 rule 11).
 */
export const nextChangeSupport = (
  previousCount: number,
  signal: string,
  currentPlanArchetype: string | null,
): number => {
  if (!currentPlanArchetype) return 0
  return signal === currentPlanArchetype ? 0 : Math.max(0, previousCount) + 1
}
