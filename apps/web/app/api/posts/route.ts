import {
  applyEventFromPost, balance, createPost, hidePost, listCommunities, listPosts, read, write,
} from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson, withPostMeta } from '@/lib/stub'
import { nearestCommunity } from '@/lib/post-location'
import { parsePostInput } from '@/lib/post-input'
import { analyzeNewPost, pipelineEnabled } from '@/lib/pipeline'
import { decodeImageDataUrl, storeImage } from '@/lib/post-image-blob'
import { ingestAnalyzedPost } from '@/lib/signal'
import { VOICE_POSTS, discardAudio, storeAudio, type StoredAudio } from '@/lib/voice-blob'
import { analyzeVoice, type VoiceResult } from '@living-city/pipeline'
import { voiceNotice } from '@/lib/post-audio'
import {
  AUTHENTICITY_GATE, gateText, scoreText, setAuthenticity, type Authenticity,
} from '@/lib/authenticity'

/**
 * What the composer needs to show the right one of the five degraded states.
 * Null for a post that carried no voice note, so an ordinary post's response
 * body is unchanged.
 */
const voiceSummary = (voice: VoiceResult | null) => (voice
  ? {
    state: voice.degraded,
    heard: voice.analysis !== null,
    cues: voice.analysis?.audio_cues ?? [],
    notice: voiceNotice(voice.degraded),
  }
  : null)

// GET /api/posts?community=&scope=  -> analyzed, unhidden posts only
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const community = searchParams.get('community') ?? undefined
  const user = currentUser(req)
  return json({ posts: await read(() => withPostMeta(listPosts({ community }), user.id)) })
}

export async function POST(req: Request) {
  const requestStarted = Date.now()
  const parsed = parsePostInput(await readJson<unknown>(req), listCommunities().map(c => c.community_id))
  if (!parsed.ok) return badRequest(parsed.error)
  const body = parsed.value
  // The request parser checks the encoding and size. Check bytes here too,
  // before points are credited or anything is stored under a public image URL.
  if (body.image_url?.startsWith('data:') && !decodeImageDataUrl(body.image_url)) {
    return badRequest('Choose a valid JPEG, PNG, or WebP photo.')
  }
  let communityId = body.community_id
  if (!communityId) {
    if (typeof body.lon !== 'number' || typeof body.lat !== 'number') {
      return badRequest('either community_id or lon/lat is required')
    }
    communityId = nearestCommunity(listCommunities(), body.lon, body.lat)?.community_id
  }
  if (!communityId) return badRequest('could not assign a community')

  const user = currentUser(req)
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

  // Camera and laptop photos start as data URLs. Persist them when a Blob token
  // is available; otherwise retain the validated inline URL, which the OpenAI
  // provider already forwards as an image part to Call A.
  if (body.image_url?.startsWith('data:')) {
    const image = await storeImage(created.post.id, body.image_url)
    if (!image) return badRequest('Choose a valid JPEG, PNG, or WebP photo.')
    if (image.url !== body.image_url) {
      await write(() => {
        const post = listPosts({ includeHidden: true }).find((row) => row.id === created.post.id)
        if (post) post.image_url = image.url
      })
      created.post.image_url = image.url
    }
  }

  // Voice work is fenced behind a flag AND the presence of a clip, so a photo
  // or text post does not execute one extra await. That is the latency
  // guarantee in T3, and it is structural rather than measured.
  let audio: StoredAudio | null = null
  let uploadMs = 0
  if (VOICE_POSTS && body.audio_url) {
    const uploadStarted = Date.now()
    audio = await storeAudio(created.post.id, body.audio_url)
    uploadMs = Date.now() - uploadStarted
    console.info(JSON.stringify({
      at: 'voice.upload', post_id: created.post.id,
      stored: audio ? (audio.key ? 'blob' : 'inline') : 'rejected',
      bytes: audio?.bytes ?? 0, ms: uploadMs,
    }))
  }

  // The voice call, before Call A because its transcript is folded into Call
  // A's payload. Never throws: every failure is a rung with a log line and a
  // notice, and the post carries on with its caption.
  let voice: VoiceResult | null = null
  let voiceMs = 0
  if (audio) {
    const voiceStarted = Date.now()
    voice = await analyzeVoice({
      audio: { mimeType: audio.mimeType, data: audio.base64 },
      caption: body.text,
      blockName: selected?.name ?? null,
      localTime: created.post.created_at,
      hasPhoto: Boolean(body.image_url),
    })
    voiceMs = Date.now() - voiceStarted
    // Retention, honoured the moment the transcript exists. Not awaited: the
    // judge is standing there, and a slow delete must not hold the response.
    void discardAudio(audio)
  }

  if (!pipelineEnabled()) {
    // Nothing else in the stub ever moves a plan, so a post would land and the
    // city would sit there. `city_event` names the block this post just changed
    // — usually null — so the app knows which block to watch instead of
    // assuming it is the one the post was filed under. Hack the North is at the
    // venue no matter whose phone it came from.
    const changed = await write(() => applyEventFromPost(created.post))
    return json({
      ...created, voice: voiceSummary(voice), city_event: changed?.community_id ?? null,
    }, 201)
  }

  // Call A runs inline, before the response, because Vercel has no worker to
  // drain a queue (docs/02 section 4.2). The post is `pending` and invisible
  // in every feed until it returns; an `unsafe` verdict hides it outright.
  created.post.status = 'pending'

  // The gate starts now, beside Call A, and is abandoned the moment Call A
  // finishes. `deadline` is what enforces that: the race cannot settle later
  // than Call A does, so allSettled below adds nothing to the critical path.
  // If the gate loses, the score is null and the post proceeds normally.
  const gate: Promise<Authenticity | null> = AUTHENTICITY_GATE
    ? scoreText(gateText(body.text, voice?.analysis?.transcript ?? null))
    : Promise.resolve(null)

  const callAStarted = Date.now()
  const analysis = analyzeNewPost(created.post, voice)
  const deadline = analysis.then(() => null, () => null)

  const [verdictResult, scoreResult] = await Promise.allSettled([
    analysis,
    Promise.race([gate, deadline]),
  ])

  if (verdictResult.status === 'rejected') throw verdictResult.reason
  const verdict = verdictResult.value
  const score = scoreResult.status === 'fulfilled' ? scoreResult.value : null
  setAuthenticity(created.post.id, score)

  /**
   * Step 8 of T3, measured on every post rather than once in rehearsal.
   *
   * `added_ms` is what voice cost this post beyond what it would have cost
   * without one: the upload plus the OMNI call. The gate contributes nothing by
   * construction, because it is abandoned when Call A finishes.
   *
   * For a photo or text post `added_ms` is 0, and it is 0 because neither
   * branch above executed, not because the numbers happened to cancel.
   */
  console.info(JSON.stringify({
    at: 'post.latency',
    post_id: created.post.id,
    voice: Boolean(audio),
    upload_ms: uploadMs,
    omni_ms: voiceMs,
    added_ms: uploadMs + voiceMs,
    call_a_ms: Date.now() - callAStarted,
    total_ms: Date.now() - requestStarted,
    gate: AUTHENTICITY_GATE ? (score ? 'scored' : 'lost_or_null') : 'off',
  }))

  // The row above is detached once the write commits, so the verdict is applied
  // by id against freshly loaded state.
  await write(() => {
    const row = listPosts({ includeHidden: true }).find(p => p.id === created.post.id)
    if (row) row.status = verdict.status
    if (verdict.hidden) hidePost(created.post.id, 'auto')
  })
  created.post.status = verdict.status
  created.post.hidden = verdict.hidden
  created.post.hidden_reason = verdict.hidden_reason

  // Signal layer (SIGNAL_LAYER, off by default). Not awaited: the post is
  // already created and the response is already leaving, and no index write or
  // embedding may sit between a post being created and the block rebuilding.
  // Swallows its own errors, so this cannot fail the post.
  ingestAnalyzedPost(created.post)

  return json({ ...created, voice: voiceSummary(voice) }, 201)
}
