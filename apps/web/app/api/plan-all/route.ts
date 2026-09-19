import { allPlans, cityVersion, replan, write } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// POST /api/plan-all -> force planning for every community
export async function POST() {
  return json(await write(() => ({
    replanned: allPlans().map((p) => replan(p.community_id)?.community_id).filter(Boolean),
    version: cityVersion(),
  })))
}
