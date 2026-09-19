import { blockTrends, incidentClusters, risingStress } from '@living-city/signal'
import { json } from '@/lib/stub'
import { requireGovernment } from '@/lib/civic-gate'
import { signalEnabled } from '@/lib/signal'

// GET /api/civic/signal/trends?window=24h&dimension=stress
//
// The three queries behind the civic trend panel, in one request so the panel
// paints once rather than three times:
//
//   trends    terms + avg aggregation: dimensions and volume per block
//   rising    ES|QL: which blocks' stress rose fastest in the last hour
//   clusters  ES|QL + an exact 500 m refinement: incident clusters in 24 hours
//
// Each carries its own metadata, including whether it was answered by
// Elasticsearch or by the store fallback and the ES|QL it ran, so the panel can
// show a judge the query rather than asking them to take it on faith.
//
// Runs all three in parallel: they are independent, and the panel is no use
// until it has all three.
export async function GET(req: Request) {
  const denied = requireGovernment(req)
  if (denied) return denied
  if (!signalEnabled()) {
    return json({ error: 'signal layer is off', code: 'SIGNAL_LAYER_OFF' }, 404)
  }

  const { searchParams } = new URL(req.url)
  const window = searchParams.get('window') ?? '24h'
  const dimension = searchParams.get('dimension') ?? 'stress'
  const block = searchParams.get('block')

  const [trends, rising, clusters] = await Promise.all([
    blockTrends({ window, blockIds: block ? [block] : undefined }),
    risingStress(dimension),
    incidentClusters(),
  ])

  return json({ trends, rising, clusters })
}
