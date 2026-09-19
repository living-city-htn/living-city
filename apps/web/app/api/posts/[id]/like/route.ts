import { likeCount, toggleLike, write } from '@living-city/fixtures/store'
import { currentUser, json, type RouteCtx } from '@/lib/stub'

// POST /api/posts/:id/like -> toggle, credits points both ways (docs/01 section 8.8)
export async function POST(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  return json(await write(() => ({ ...toggleLike(currentUser(req).id, id), likes: likeCount(id) })))
}
