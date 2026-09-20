import { listIncidents, verifyIncident, write } from '@living-city/fixtures/store'
import { lockField } from '@living-city/signal'
import { badRequest, json, notFound, readJson, requireGovernment, type RouteCtx } from '@/lib/stub'

// PATCH /api/civic/incidents/:id -> { status: "verified", staff_note }
// Status only ever moves to "verified" this weekend. docs/02 section 4.7.
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const { id } = await ctx.params
  const body = await readJson<{ status?: string; staff_note?: string }>(req)
  if (body?.status && body.status !== 'verified') return badRequest('status can only be set to "verified"')
  if (body?.staff_note !== undefined && typeof body.staff_note !== 'string') {
    return badRequest('staff_note must be text')
  }
  if (body?.staff_note && body.staff_note.length > 500) {
    return badRequest('staff_note must be 500 characters or fewer')
  }
  const note = body?.staff_note
  const incident = await write(() => {
    const existing = listIncidents().find((candidate) => candidate.id === id)
    if (!existing) return null
    // Verification is idempotent: a repeated click cannot award the 25-point
    // incident reward a second time.
    if (existing.status === 'verified') return existing
    return verifyIncident(id, note)
  })
  if (!incident) return notFound('no such incident')

  // A human has now decided this row, so the civic agent may not change it
  // again. `staffTouched` already infers this from a verified status; the lock
  // is the explicit record, and it survives a later status change.
  // Inert when SIGNAL_LAYER is off - the store is module memory either way.
  lockField(id)

  return json({ incident })
}
