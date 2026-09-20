import { hidePost, write } from '@living-city/fixtures/store'
import { json, notFound, readJson, requireGovernment, type RouteCtx } from '@/lib/stub'
import { removeFromSignal } from '@/lib/signal'

// PATCH /api/posts/:id/hide -> operator or government one-tap hide.
// Removes the post from every feed, from aggregation, and its incident from the
// government page (docs/02 section 4.7).
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const { id } = await ctx.params
  const body = await readJson<{ reason?: 'auto' | 'operator' }>(req)
  const reason = body?.reason ?? 'operator'
  const post = await write(() => hidePost(id, reason))
  if (!post) return notFound('no such post')

  // "Every surface" includes the evidence index, so this is awaited rather than
  // fired and forgotten. It never throws: a hide must succeed against a dead
  // cluster, and the document is then removed by the next backfill.
  await removeFromSignal(id)

  return json({ post })
}
