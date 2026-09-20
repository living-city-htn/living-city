import { cityVersion, drillCommunity, read } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'
import { allPipelinePlans, pipelineEnabled } from '@/lib/pipeline'

// GET /api/city/version -> { plans: { community_id: plan_id }, updated_at, drill }
// The scene polls this every 5 s and rebuilds only the blocks whose plan id changed.
//
// `drill` rides along because it is the same question — what about the city has
// changed since you last looked — and because moment 8 has every judge's phone
// on this endpoint. A second poll for an operator toggle nobody flips more than
// twice would be real load for nothing.
export async function GET() {
  const [version, drill] = await read(() => [cityVersion(), drillCommunity()] as const)
  if (!pipelineEnabled()) return json({ ...version, drill })

  // Pipeline plans live separately from the fixture store until persistence is
  // introduced. Exposing their IDs here keeps the existing polling contract:
  // the scene sees exactly which blocks to re-fetch, then GET /plan supplies
  // the accepted plan.
  const pipelinePlans = Object.fromEntries(
    allPipelinePlans().map((plan) => [plan.community_id, plan.plan_id]),
  )
  return json({ ...version, drill, plans: { ...version.plans, ...pipelinePlans } })
}
