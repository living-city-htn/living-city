import { listPosts, read } from '@living-city/fixtures/store'
import { currentUser, json, withPostMeta, type RouteCtx } from '@/lib/stub'

// GET /api/communities/:id/posts?scenario= -> recent posts for the "why" panel
//
// `scenario=drill` asks for the block as it is during the City Hall rehearsal
// instead of on a normal day. Nothing is stored either way; the scenario only
// decides which of the seeded posts are read, so ending the drill restores the
// ordinary ones with no cleanup.
export async function GET(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const user = currentUser(req)
  const scenario = new URL(req.url).searchParams.get('scenario') === 'drill' ? 'drill' as const : undefined
  return json({
    posts: await read(() =>
      withPostMeta(listPosts({ community: decodeURIComponent(id), scenario }).slice(0, 10), user.id)),
  })
}
