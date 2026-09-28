import { read } from '@living-city/fixtures/store'
import { requireGovernment } from '@/lib/stub'
import { filtersFrom, incidentsCsv } from '@/lib/civic'
import { incidentRows } from '@/lib/civic-incidents'

// GET /api/civic/incidents/export?<same filters> -> text/csv
// The filtered incident list as CSV. docs/01 section 8.9, user story 12.
export async function GET(req: Request) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const filters = filtersFrom(new URL(req.url).searchParams)
  const csv = incidentsCsv(await read(() => incidentRows(filters)))
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="living-city-incidents-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
