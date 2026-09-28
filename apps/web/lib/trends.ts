/**
 * Community trends for the civic view. docs/01 section 8.9 and user story 11:
 * "dimensions and valence over time, top tags, post volume, from the
 * aggregator". Computed from the per-post analyses that already drive the
 * city; nothing here is written by a model.
 *
 * Pure: the route gathers posts, analyses and plans, this does the arithmetic.
 */

export type TrendPost = { id: string; community_id: string; created_at: string }
export type TrendAnalysis = {
  valence: number | null
  dimensions: Record<string, number | null>
  tags: string[]
}

export type DayPoint = { day: string; posts: number; valence: number | null }

export type CommunityTrend = {
  community_id: string
  name: string
  /** The public plan's current mood. */
  mood: string | null
  posts: number
  analysed: number
  valence: number | null
  /** Change in mean valence, second half of the window against the first. */
  valence_change: number | null
  /** The strongest dimensions, highest first. */
  dimensions: Array<{ name: string; value: number }>
  top_tags: Array<{ tag: string; count: number }>
  daily: DayPoint[]
}

export type TrendsInput = {
  posts: TrendPost[]
  analysisOf: (postId: string) => TrendAnalysis | null
  communities: Array<{ community_id: string; name: string }>
  moodOf: (communityId: string) => string | null
  days: number
  now?: number
  /** Formats an instant as the city's calendar day. */
  dayOf: (iso: string | Date) => string
}

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null

export function computeTrends(input: TrendsInput): { days: string[]; communities: CommunityTrend[] } {
  const now = input.now ?? Date.now()
  const days: string[] = []
  for (let i = input.days - 1; i >= 0; i--) days.push(input.dayOf(new Date(now - i * 86_400_000)))
  const inWindow = new Set(days)
  const posts = input.posts.filter((p) => inWindow.has(input.dayOf(p.created_at)))
  const half = days[Math.floor(days.length / 2)] ?? days[0]!

  const communities = input.communities.map(({ community_id, name }) => {
    const mine = posts.filter((p) => p.community_id === community_id)
    const analysed = mine
      .map((p) => ({ p, a: input.analysisOf(p.id) }))
      .filter((x): x is { p: TrendPost; a: TrendAnalysis } => x.a !== null)

    const valences = analysed.map((x) => x.a.valence).filter((v): v is number => v !== null)
    const early = analysed.filter((x) => input.dayOf(x.p.created_at) < half)
      .map((x) => x.a.valence).filter((v): v is number => v !== null)
    const late = analysed.filter((x) => input.dayOf(x.p.created_at) >= half)
      .map((x) => x.a.valence).filter((v): v is number => v !== null)
    const e = mean(early)
    const l = mean(late)

    const dims = new Map<string, number[]>()
    const tags = new Map<string, number>()
    for (const { a } of analysed) {
      for (const [k, v] of Object.entries(a.dimensions)) {
        if (typeof v === 'number') dims.set(k, [...(dims.get(k) ?? []), v])
      }
      for (const t of a.tags) tags.set(t, (tags.get(t) ?? 0) + 1)
    }

    const daily = days.map((day) => {
      const onDay = mine.filter((p) => input.dayOf(p.created_at) === day)
      const v = onDay.map((p) => input.analysisOf(p.id)?.valence)
        .filter((x): x is number => typeof x === 'number')
      return { day, posts: onDay.length, valence: mean(v) }
    })

    return {
      community_id,
      name,
      mood: input.moodOf(community_id),
      posts: mine.length,
      analysed: analysed.length,
      valence: mean(valences),
      valence_change: e !== null && l !== null ? Math.round((l - e) * 10) / 10 : null,
      dimensions: [...dims]
        .map(([k, v]) => ({ name: k, value: mean(v)! }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
        .slice(0, 4),
      top_tags: [...tags]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, 5),
      daily,
    }
  })

  communities.sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name))
  return { days, communities }
}
