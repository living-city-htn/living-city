import { planFor, replan } from '@living-city/fixtures/store'
import { json, notFound, type RouteCtx } from '@/lib/stub'
import { pipelineEnabled, planOf, planOne } from '@/lib/pipeline'

// GET  /api/communities/:id/plan -> latest accepted CommunityPlan
export async function GET(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const communityId = decodeURIComponent(id)
  // A real plan wins over the fixture whenever one has been produced; before
  // the first tick there is none, and the fixture keeps the block on screen.
  const plan = (pipelineEnabled() ? planOf(communityId) : null) ?? planFor(communityId)
  return plan ? json({ plan }) : notFound('no plan for that community')
}

// POST /api/communities/:id/plan -> force a planning cycle (demo control)
export async function POST(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const communityId = decodeURIComponent(id)

  if (pipelineEnabled()) {
    const result = await planOne(communityId, { force: true })
    return result ? json({ plan: result.plan, changed: result.changed }) : notFound('no such community')
  }

  const plan = replan(communityId)
  return plan ? json({ plan }) : notFound('no such community')
}
