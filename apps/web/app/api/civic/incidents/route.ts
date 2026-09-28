import { read } from '@living-city/fixtures/store'
import { json, requireGovernment } from '@/lib/stub'
import { filtersFrom } from '@/lib/civic'
import { incidentRows } from '@/lib/civic-incidents'

// GET /api/civic/incidents?community=&type=&status=&range=24h|7d|30d&from=&to=
// Government only. docs/01 section 8.9.
export async function GET(req: Request) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const filters = filtersFrom(new URL(req.url).searchParams)
  return json({ incidents: await read(() => incidentRows(filters)) })
}
