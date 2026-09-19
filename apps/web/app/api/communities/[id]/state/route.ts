import { listPosts, planFor } from '@living-city/fixtures/store'
import { json, notFound, type RouteCtx } from '@/lib/stub'

// GET /api/communities/:id/state -> SemanticState (current, baseline)
// Pipeline's aggregator owns the real shape (docs/03 section 2.3). The stub
// returns enough for the panel to render: summary, mood, tags, reasons.
export async function GET(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const communityId = decodeURIComponent(id)
  const plan = planFor(communityId)
  if (!plan) return notFound('no such community')
  return json({
    community_id: communityId,
    summary: plan.summary,
    mood: plan.mood,
    top_tags: plan.identity_tags,
    reasons: plan.stability.reasons,
    post_count: listPosts({ community: communityId }).length,
    data_sufficiency: 'stub',
  })
}
