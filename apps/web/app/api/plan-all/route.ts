import { allPlans, cityVersion, replan } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// POST /api/plan-all -> force planning for every community
export async function POST() {
  const replanned = allPlans().map((p) => replan(p.community_id)?.community_id).filter(Boolean)
  return json({ replanned, version: cityVersion() })
}
