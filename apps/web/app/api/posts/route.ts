import { balance, createPost, hidePost, listCommunities, listPosts } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson, withPostMeta, USE_FIXTURES } from '@/lib/stub'
import { parsePostInput } from '@/lib/post-input'
import { analyzeNewPost, pipelineEnabled } from '@/lib/pipeline'

// GET /api/posts?community=&scope=  -> analyzed, unhidden posts only
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return json({
    posts: withPostMeta(listPosts({ community: searchParams.get('community') ?? undefined })),
  })
}

// Product's fixture photo transport; Pipeline replaces it with Blob upload.
export async function POST(req: Request) {
  const parsed = parsePostInput(await readJson<unknown>(req), listCommunities().map(c => c.community_id))
  if (!parsed.ok) return badRequest(parsed.error)
  const body = parsed.value
  if (!USE_FIXTURES && body.image_url?.startsWith('data:')) {
    return json({ error: 'Photo upload is not ready yet. You can post your caption without the photo.', code: 'PHOTO_UNAVAILABLE' }, 503)
  }
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

  const user = currentUser()
  const before = balance(user.id)
  const selected = listCommunities().find(c => c.community_id === communityId)
  const post = createPost({
    user_id: user.id,
    text: body.text,
    image_url: body.image_url ?? null,
    lon: body.lon ?? selected?.centroid[0] ?? 0,
    lat: body.lat ?? selected?.centroid[1] ?? 0,
    community_id: communityId,
    is_incident_report: body.is_incident_report,
  })

  const pointsEarned = balance(user.id) - before
  const response = () => json({ post, balance: balance(user.id), points_earned: pointsEarned }, 201)
  if (!pipelineEnabled()) return response()

  // Call A runs inline, before the response, because Vercel has no worker to
  // drain a queue (docs/02 section 4.2). The post is `pending` and invisible
  // in every feed until it returns; an `unsafe` verdict hides it outright.
  // `createPost` hands back the live row, so these are the stored values.
  post.status = 'pending'
  const verdict = await analyzeNewPost(post)
  post.status = verdict.status
  if (verdict.hidden) hidePost(post.id, 'auto')

  return response()
}
