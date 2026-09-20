import { placeBuilding, removeBuilding, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, notFound, readJson, type RouteCtx } from '@/lib/stub'

/**
 * Move a building onto a slot on the user's own map, or take it away.
 *
 * Both take the owner from `currentUser()` and pass it to the store, which
 * matches on `user_id` as well as `id`. Guessing another user's building id
 * therefore achieves nothing - the miss is indistinguishable from a building
 * that does not exist, which is the answer we want to give.
 */

// PATCH /api/me/buildings/:id -> { slot_id: string | null }
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const body = await readJson<{ slot_id?: string | null }>(req)
  if (body === null || !('slot_id' in body)) return badRequest('slot_id is required')

  const slotId = body.slot_id ?? null
  if (slotId !== null && typeof slotId !== 'string') {
    return badRequest('slot_id must be a string or null')
  }

  const result = await write(() => placeBuilding(currentUser().id, id, slotId))
  return result.ok ? json(result) : notFound('No such building.')
}

// DELETE /api/me/buildings/:id
export async function DELETE(_req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const result = await write(() => removeBuilding(currentUser().id, id))
  return result.ok ? json({ ok: true }) : notFound('No such building.')
}
