import { listCommunities, listSlots } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// GET /api/city -> CommunityGeo[] + BlockLayout + DecorationSlots
export async function GET() {
  return json({ communities: listCommunities(), slots: listSlots() })
}
