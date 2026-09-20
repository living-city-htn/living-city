import { likeCount, toggleLike, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, notFound, type RouteCtx } from '@/lib/stub'

// POST /api/posts/:id/like -> toggle, credits points both ways (docs/01 section 8.8)
export async function POST(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const result = await write(() => {
    const outcome = toggleLike(currentUser(req).id, id)
    return outcome.ok ? { ...outcome, likes: likeCount(id) } : outcome
  })
  if (!result.ok) {
    return result.reason === 'post not found' ? notFound(result.reason) : badRequest(result.reason)
  }
  return json({ liked: result.liked, balance: result.balance, likes: result.likes })
}
