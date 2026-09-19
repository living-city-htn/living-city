import { planFor, replan } from '@living-city/fixtures/store'
import { json, notFound, type RouteCtx } from '@/lib/stub'

// GET  /api/communities/:id/plan -> latest accepted CommunityPlan
export async function GET(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const plan = planFor(decodeURIComponent(id))
  return plan ? json({ plan }) : notFound('no plan for that community')
}

// POST /api/communities/:id/plan -> force a planning cycle (demo control)
export async function POST(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const plan = replan(decodeURIComponent(id))
  return plan ? json({ plan }) : notFound('no such community')
}
