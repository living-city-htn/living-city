import { setIncidentNote, setIncidentStatus, write } from '@living-city/fixtures/store'
import { lockField } from '@living-city/signal'
import { badRequest, json, notFound, readJson, requireGovernment, type RouteCtx } from '@/lib/stub'

// PATCH /api/civic/incidents/:id -> { status?: "verified" | "resolved", staff_note? }
// reported -> verified -> resolved, never backwards. A note alone keeps the
// status. docs/01 section 8.9.
export async function PATCH(req: Request, ctx: RouteCtx<{ id: string }>) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const { id } = await ctx.params
  const body = await readJson<{ status?: unknown; staff_note?: unknown }>(req)
  const status = body?.status
  const note = body?.staff_note
  if (status !== undefined && status !== 'verified' && status !== 'resolved') {
    return badRequest('status must be "verified" or "resolved"')
  }
  if (note !== undefined && typeof note !== 'string') return badRequest('staff_note must be text')
  if (typeof note === 'string' && note.length > 500) {
    return badRequest('staff_note must be 500 characters or fewer')
  }
  if (status === undefined && note === undefined) return badRequest('send a status or a staff_note')

  const result = await write(() => {
    if (status === undefined) {
      const incident = setIncidentNote(id, note as string)
      return incident ? { ok: true as const, incident } : { ok: false as const, reason: 'not found' as const }
    }
    return setIncidentStatus(id, status, note as string | undefined)
  })
  if (!result.ok) {
    return result.reason === 'not found'
      ? notFound('no such incident')
      : badRequest('an incident cannot move back to an earlier status')
  }

  // A human has now decided this row, so the civic agent may not change it
  // again. The lock is explicit and remains harmless when SIGNAL_LAYER is off.
  lockField(id)
  return json({ incident: result.incident })
}
