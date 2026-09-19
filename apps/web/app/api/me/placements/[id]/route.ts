import { removePlacement, write } from '@living-city/fixtures/store'
import { currentUser, json, notFound, type RouteCtx } from '@/lib/stub'

// DELETE /api/me/placements/:id -> remove, returns the item to inventory
export async function DELETE(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const result = await write(() => removePlacement(currentUser().id, id))
  return result.ok ? json({ ok: true }) : notFound(result.reason)
}
