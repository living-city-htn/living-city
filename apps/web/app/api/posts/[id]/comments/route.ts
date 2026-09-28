import { addComment, commentsOf, displayNameOf, listPosts, read, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, notFound, readJson, type RouteCtx } from '@/lib/stub'

/**
 * Comments on one post. One level, text only. docs/01 section 8.3.
 *
 * GET  /api/posts/:id/comments -> { comments: [{ id, text, author_name, created_at, mine }] }
 * POST /api/posts/:id/comments { text } -> { comment, balance, points_earned, count }
 */
const visible = (postId: string) =>
  listPosts({ includeHidden: false }).some((p) => p.id === postId)
  || listPosts({ scenario: 'drill' }).some((p) => p.id === postId)

const shape = (viewerId: string) => (c: { id: string; user_id: string; text: string; created_at: string }) => ({
  id: c.id,
  text: c.text,
  created_at: c.created_at,
  author_name: displayNameOf(c.user_id) ?? 'Resident',
  mine: c.user_id === viewerId,
})

export async function GET(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const viewer = currentUser(req).id
  const result = await read(() => (visible(id) ? commentsOf(id).map(shape(viewer)) : null))
  if (!result) return notFound('post not found')
  return json({ comments: result })
}

export async function POST(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const body = await readJson<{ text?: unknown }>(req)
  if (typeof body?.text !== 'string') return badRequest('Write a comment first.')
  const user = currentUser(req)
  const result = await write(() => {
    const outcome = addComment(user.id, id, body.text as string)
    return outcome.ok ? { ...outcome, count: commentsOf(id).length } : outcome
  })
  if (!result.ok) {
    if (result.reason === 'post not found') return notFound(result.reason)
    return badRequest(result.reason === 'empty' ? 'Write a comment first.' : 'Keep comments under 500 characters.')
  }
  return json({
    comment: shape(user.id)(result.comment),
    balance: result.balance,
    points_earned: result.points_earned,
    count: result.count,
  }, 201)
}
