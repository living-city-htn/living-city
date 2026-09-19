import { createPost, hidePost, listCommunities, listPosts } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson } from '@/lib/stub'
import { analyzeNewPost, pipelineEnabled } from '@/lib/pipeline'

// GET /api/posts?community=&scope=  -> analyzed, unhidden posts only
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json({ posts: listPosts({ community: searchParams.get('community') ?? undefined }) })
}

type Body = { text?: string; image_url?: string | null; lon?: number; lat?: number; community_id?: string; is_incident_report?: boolean }

// POST /api/posts -> create, assign to a community, run Call A, credit points.
// Pipeline owns the real one. The stub skips Call A and assigns by nearest centroid,
// which is also Pipeline's documented fallback for a missing assignCommunity().
export async function POST(req: Request) {
  const body = await readJson<Body>(req)
  if (!body?.text) return badRequest('text is required')

  let communityId = body.community_id
  if (!communityId) {
    if (typeof body.lon !== 'number' || typeof body.lat !== 'number') {
      return badRequest('either community_id or lon/lat is required')
    }
    const { lon, lat } = body
    let best: string | undefined
    let bestD = Infinity
    for (const c of listCommunities()) {
      const [clon, clat] = c.centroid
      if (clon === undefined || clat === undefined) continue
      const d = Math.hypot(clon - lon, clat - lat)
      if (d < bestD) { bestD = d; best = c.community_id }
    }
    communityId = best
  }
  if (!communityId) return badRequest('could not assign a community')

  const post = createPost({
    user_id: currentUser().id,
    text: body.text,
    image_url: body.image_url ?? null,
    lon: body.lon ?? 0,
    lat: body.lat ?? 0,
    community_id: communityId,
    is_incident_report: body.is_incident_report,
  })

  if (!pipelineEnabled()) return json({ post }, 201)

  // Call A runs inline, before the response, because Vercel has no worker to
  // drain a queue (docs/02 section 4.2). The post is `pending` and invisible
  // in every feed until it returns; an `unsafe` verdict hides it outright.
  // `createPost` hands back the live row, so these are the stored values.
  post.status = 'pending'
  const verdict = await analyzeNewPost(post)
  post.status = verdict.status
  if (verdict.hidden) hidePost(post.id, 'auto')

  return json({ post }, 201)
}
