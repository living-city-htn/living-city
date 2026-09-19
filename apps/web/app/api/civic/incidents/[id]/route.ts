import { verifyIncident, write } from '@living-city/fixtures/store'
import { badRequest, json, notFound, readJson, type RouteCtx } from '@/lib/stub'

// PATCH /api/civic/incidents/:id -> { status: "verified", staff_note }
// Status only ever moves to "verified" this weekend. docs/02 section 4.7.
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const { id } = await ctx.params
  const body = await readJson<{ status?: string; staff_note?: string }>(req)
  if (body?.status && body.status !== 'verified') return badRequest('status can only be set to "verified"')
  const note = body?.staff_note
  const incident = await write(() => verifyIncident(id, note))
  return incident ? json({ incident }) : notFound('no such incident')
}
