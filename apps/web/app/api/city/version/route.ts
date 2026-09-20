import { cityVersion, read } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'
import { allPipelinePlans, pipelineEnabled } from '@/lib/pipeline'

// GET /api/city/version -> { plans: { community_id: plan_id }, updated_at }
// The scene polls this every 5 s and rebuilds only the blocks whose plan id changed.
export async function GET() {
  const version = await read(cityVersion)
  if (!pipelineEnabled()) return json(version)

  // Pipeline plans live separately from the fixture store until persistence is
  // introduced. Exposing their IDs here keeps the existing polling contract:
  // the scene sees exactly which blocks to re-fetch, then GET /plan supplies
  // the accepted plan.
  const pipelinePlans = Object.fromEntries(
    allPipelinePlans().map((plan) => [plan.community_id, plan.plan_id]),
  )
  return json({ ...version, plans: { ...version.plans, ...pipelinePlans } })
}
