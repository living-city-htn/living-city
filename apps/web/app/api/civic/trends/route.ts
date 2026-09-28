import { postAnalysisMocks } from '@living-city/fixtures'
import { cityDay, listCommunities, listPosts, planFor, read } from '@living-city/fixtures/store'
import { json, requireGovernment } from '@/lib/stub'
import { analysisOf, planOf } from '@/lib/pipeline'
import { computeTrends } from '@/lib/trends'

// GET /api/civic/trends?days=7|30|90 -> { days, communities: CommunityTrend[] }
//
// Mood and activity per community over time, computed from the per-post
// analyses (docs/01 section 8.9). Works with the signal layer off: this is the
// deterministic panel, and the Elastic-backed one stays behind SIGNAL_LAYER.
const mocks = new Map(postAnalysisMocks.map((a) => [a.post_id, a]))

export async function GET(req: Request) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const requested = Number(new URL(req.url).searchParams.get('days') ?? 30)
  const days = [7, 30, 90].includes(requested) ? requested : 30
  return json(await read(() => computeTrends({
    posts: listPosts(),
    analysisOf: (id) => analysisOf(id) ?? mocks.get(id) ?? null,
    communities: listCommunities().map((c) => ({ community_id: c.community_id, name: c.name })),
    moodOf: (id) => planOf(id)?.mood ?? planFor(id)?.mood ?? null,
    days,
    dayOf: cityDay,
  })))
}
