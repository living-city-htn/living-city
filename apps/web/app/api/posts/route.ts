import {
  balance, createPost, hidePost, listCommunities, listPosts, read, write,
} from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson, withPostMeta, USE_FIXTURES } from '@/lib/stub'
import { nearestCommunity } from '@/lib/post-location'
import { parsePostInput } from '@/lib/post-input'
import { analyzeNewPost, pipelineEnabled } from '@/lib/pipeline'

// GET /api/posts?community=&scope=  -> analyzed, unhidden posts only
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const community = searchParams.get('community') ?? undefined
  return json({ posts: await read(() => withPostMeta(listPosts({ community }))) })
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
    communityId = nearestCommunity(listCommunities(), body.lon, body.lat)?.community_id
  }
  if (!communityId) return badRequest('could not assign a community')

  const user = currentUser()
  const selected = listCommunities().find(c => c.community_id === communityId)
  const assigned = communityId

  // One write: create the post and read the points it earned, so a second
  // instance cannot land between the two and report the wrong balance.
  const created = await write(() => {
    const before = balance(user.id)
    const post = createPost({
      user_id: user.id,
      text: body.text,
      image_url: body.image_url ?? null,
      lon: body.lon ?? selected?.centroid[0] ?? 0,
      lat: body.lat ?? selected?.centroid[1] ?? 0,
      community_id: assigned,
      is_incident_report: body.is_incident_report,
    })
    return { post, balance: balance(user.id), points_earned: balance(user.id) - before }
  })

  if (!pipelineEnabled()) return json(created, 201)

  // Call A runs inline, before the response, because Vercel has no worker to
  // drain a queue (docs/02 section 4.2). The post is `pending` and invisible
  // in every feed until it returns; an `unsafe` verdict hides it outright.
  created.post.status = 'pending'
  const verdict = await analyzeNewPost(created.post)

  // The row above is detached once the write commits, so the verdict is applied
  // by id against freshly loaded state.
  await write(() => {
    const row = listPosts({ includeHidden: true }).find(p => p.id === created.post.id)
    if (row) row.status = verdict.status
    if (verdict.hidden) hidePost(created.post.id, 'auto')
  })
  created.post.status = verdict.status

  return json(created, 201)
}
