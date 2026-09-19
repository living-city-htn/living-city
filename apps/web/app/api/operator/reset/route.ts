import { cityVersion, reset } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// POST /api/operator/reset -> seed posts, plans, balances, placements and
// incident status back to their starting state. Rehearsed between run-throughs
// and pressed once before the judges arrive.
export async function POST() {
  reset()
  return json({ ok: true, version: cityVersion() })
}
