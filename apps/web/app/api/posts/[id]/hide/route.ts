import { hidePost } from '@living-city/fixtures/store'
import { json, notFound, readJson, type RouteCtx } from '@/lib/stub'

// PATCH /api/posts/:id/hide -> operator or government one-tap hide.
// Removes the post from every feed, from aggregation, and its incident from the
// government page (docs/02 section 4.7).
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const body = await readJson<{ reason?: 'auto' | 'operator' }>(req)
  const post = hidePost(id, body?.reason ?? 'operator')
  return post ? json({ post }) : notFound('no such post')
}
