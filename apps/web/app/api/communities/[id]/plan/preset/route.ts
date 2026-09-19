import { applyPresetFestival } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// POST /api/communities/:id/plan/preset
// The operator's insurance policy: writes the hand-written, validator-passing
// festival plan as the accepted plan for the demo block. docs/04 section 8.
export async function POST() {
  return json({ plan: applyPresetFestival() })
}
