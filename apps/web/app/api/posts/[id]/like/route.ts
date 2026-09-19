import { likeCount, toggleLike } from '@living-city/fixtures/store'
import { currentUser, json, type RouteCtx } from '@/lib/stub'

// POST /api/posts/:id/like -> toggle, credits points both ways (docs/01 section 8.8)
export async function POST(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const result = toggleLike(currentUser().id, id)
  return json({ ...result, likes: likeCount(id) })
}
