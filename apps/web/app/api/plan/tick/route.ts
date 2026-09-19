import { allPlans, cityVersion, replan } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'
import { pipelineEnabled, planTick } from '@/lib/pipeline'

// POST /api/plan/tick -> replan communities whose input hash changed.
// The operator panel calls this every 10 s while it is open; it is the only
// thing replanning blocks during moment 8.
export async function POST() {
  if (pipelineEnabled()) {
    const { replanned, checked } = await planTick()
    return json({ replanned, checked, version: cityVersion() })
  }
  // Stub: no hashes, so a no-op that still returns the shape the panel shows.
  return json({ replanned: [], checked: allPlans().length, version: cityVersion() })
}

// Convenience for the panel's "trigger all" control.
export async function PUT() {
  if (pipelineEnabled()) {
    // force: plan every block whether or not its input hash moved.
    const { replanned, checked } = await planTick({ force: true })
    return json({ replanned, checked, version: cityVersion() })
  }
  const replanned = allPlans().map((p) => replan(p.community_id)?.community_id).filter(Boolean)
  return json({ replanned, version: cityVersion() })
}
