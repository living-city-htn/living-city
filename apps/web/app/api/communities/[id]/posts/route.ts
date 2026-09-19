import { listPosts, read } from '@living-city/fixtures/store'
import { json, withPostMeta, type RouteCtx } from '@/lib/stub'

// GET /api/communities/:id/posts -> recent posts for the "why" panel
export async function GET(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  return json({
    posts: await read(() => withPostMeta(listPosts({ community: decodeURIComponent(id) }).slice(0, 10))),
  })
}
