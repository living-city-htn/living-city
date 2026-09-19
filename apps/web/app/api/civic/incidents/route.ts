import { listIncidents } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// GET /api/civic/incidents?community=&type=&status=
// Role-gated to government in the real build; the gate is Civic's, from Stage 1.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json({
    incidents: listIncidents({
      community: searchParams.get('community') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    }),
  })
}
