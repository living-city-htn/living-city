import { cityVersion } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// GET /api/city/version -> { plans: { community_id: plan_id }, updated_at }
// The scene polls this every 5 s and rebuilds only the blocks whose plan id changed.
export async function GET() {
  return json(cityVersion())
}
