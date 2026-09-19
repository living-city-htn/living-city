import { allPlans, cityVersion, replan } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// POST /api/plan/tick -> replan communities whose input hash changed.
// The operator panel calls this every 10 s while it is open; it is the only
// thing replanning blocks during moment 8. The stub has no hashes, so it is a
// no-op that still returns the shape the panel displays.
export async function POST() {
  return json({ replanned: [], checked: allPlans().length, version: cityVersion() })
}

// Convenience for the panel's "trigger all" control.
export async function PUT() {
  const replanned = allPlans().map((p) => replan(p.community_id)?.community_id).filter(Boolean)
  return json({ replanned, version: cityVersion() })
}
