import { publicIncidents, read } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// GET /api/incidents -> { incidents: [{ id, community_id, type, status, reported_at }] }
//
// The public overlay: open incidents for the map markers, coloured by status and
// gone once resolved (docs/01 section 8.10). No reporter, no post text, no
// photo: those are the government view's, not everybody's.
export async function GET() {
  return json({ incidents: await read(() => publicIncidents()) })
}
