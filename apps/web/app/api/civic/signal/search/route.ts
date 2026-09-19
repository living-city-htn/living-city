import { searchEvidence } from '@living-city/signal'
import { json } from '@/lib/stub'
import { requireGovernment } from '@/lib/civic-gate'
import { signalEnabled } from '@/lib/signal'

// GET /api/civic/signal/search?q=&block=&window=&k=
//
// Hybrid BM25 + vector retrieval over the evidence index. Server-side only: no
// client ever talks to Elasticsearch, and the response carries block ids and
// never coordinates.
//
// The metadata says how the answer was found - hybrid, bm25_only, fallback or
// unavailable - so a caller can tell a degraded answer from a full one.
export async function GET(req: Request) {
  const denied = requireGovernment(req)
  if (denied) return denied
  if (!signalEnabled()) {
    return json({ error: 'signal layer is off', code: 'SIGNAL_LAYER_OFF' }, 404)
  }

  const { searchParams } = new URL(req.url)
  const k = Number(searchParams.get('k') ?? 10)

  const result = await searchEvidence({
    query: searchParams.get('q') ?? undefined,
    blockId: searchParams.get('block') ?? undefined,
    window: searchParams.get('window') ?? undefined,
    k: Number.isFinite(k) ? k : 10,
  })

  return json(result)
}
