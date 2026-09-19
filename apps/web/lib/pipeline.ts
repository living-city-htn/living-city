/**
 * The seam between the web app and `packages/pipeline`. Pipeline-owned
 * (docs/04 section 4: "the city API routes in apps/web").
 *
 * Active only when USE_FIXTURES=0 and a provider key is set. With the default
 * USE_FIXTURES=1 every route below falls straight through to Product's stub,
 * byte for byte, so turning the pipeline on is an environment change and
 * turning it off again is the fuse.
 *
 * State lives in module memory rather than in Postgres, because the migrations
 * are a separate Stage 1 item and DATABASE_URL does not exist yet. Two
 * consequences worth knowing before the demo:
 *
 *   - It resets when the serverless instance recycles. The operator's reset
 *     button and the preset plan route are the recovery path.
 *   - Plans written here are NOT in Product's fixture store, so
 *     `GET /api/city/version` (Civic's) will not see them yet. Closing that
 *     needs either the migrations or a `setPlan` export on the store, which is
 *     Product's package and therefore a PR they review. Until then the scene
 *     reads plans from `GET /api/communities/:id/plan`.
 */
import { communityGeo, type CommunityGeo, type CommunityPlan, type PostAnalysis } from '@living-city/contracts'
import {
  analyzePost, buildTimeContext, emptyCycleState, foldVoiceIntoText, loadTaxonomy,
  resolveImage, runCommunityCycle, type AggregatablePost, type CommunityCycleState,
  type VoiceResult,
} from '@living-city/pipeline'
import { listCommunities, listPosts, likeCount } from '@living-city/fixtures/store'

/**
 * The one switch. Product's stub owns every request while this is false.
 *
 * The key names follow `AI_PROVIDER` (OpenAI by default, Gemini as the
 * documented alternate), so setting the wrong vendor's key leaves the pipeline
 * dark rather than failing on the first post.
 */
export const pipelineEnabled = (): boolean =>
  process.env.USE_FIXTURES === '0'
  && !!(process.env.AI_PROVIDER === 'gemini'
    ? process.env.GEMINI_API_KEY
    : process.env.OPENAI_API_KEY)

type State = {
  analyses: Map<string, PostAnalysis>
  /**
   * What OMNI heard, kept beside the analysis rather than inside it.
   *
   * `PostAnalysis` is a frozen contract and T3 forbids changing it, so audio
   * cues, the speech mood and the voice confidence live here and are read by
   * the civic display and the corroboration weight. The proposed contract
   * field is the REQUESTS entry in docs/08.
   */
  voice: Map<string, VoiceResult>
  incidents: Map<string, PostAnalysis['incident'] & { post_id: string; community_id: string }>
  cycles: Map<string, CommunityCycleState>
  plans: Map<string, CommunityPlan>
}

const state: State = {
  analyses: new Map(),
  voice: new Map(),
  incidents: new Map(),
  cycles: new Map(),
  plans: new Map(),
}

export const resetPipelineState = (): void => {
  state.analyses.clear()
  state.voice.clear()
  state.incidents.clear()
  state.cycles.clear()
  state.plans.clear()
}

let city: CommunityGeo[] | null = null

const loadCity = (): CommunityGeo[] => {
  if (city) return city
  const parsed: CommunityGeo[] = []
  for (const raw of listCommunities()) {
    const result = communityGeo.safeParse(raw)
    if (result.success) parsed.push(result.data)
  }
  city = parsed
  return parsed
}

const geoOf = (communityId: string): CommunityGeo | null =>
  loadCity().find((c) => c.community_id === communityId) ?? null

export const analysisOf = (postId: string): PostAnalysis | null =>
  state.analyses.get(postId) ?? null

export const voiceOf = (postId: string): VoiceResult | null =>
  state.voice.get(postId) ?? null

export const planOf = (communityId: string): CommunityPlan | null =>
  state.plans.get(communityId) ?? null

export const allPipelinePlans = (): CommunityPlan[] => [...state.plans.values()]

export const pipelineIncidents = () => [...state.incidents.values()]

/**
 * Call A, inline in the post handler. docs/02 section 4.2.
 *
 * Returns what the route needs to finish the post: whether it is analysed,
 * and whether it must be hidden. A post whose analysis failed stays `pending`
 * and invisible rather than appearing unanalysed in the feed.
 */
export const analyzeNewPost = async (post: {
  id: string
  text: string
  image_url: string | null
  created_at: string
  community_id: string
  is_incident_report: boolean
}, voice: VoiceResult | null = null,
): Promise<{ status: 'pending' | 'analyzed'; hidden: boolean; hidden_reason: 'auto' | null }> => {
  const taxonomy = loadTaxonomy()
  const geo = geoOf(post.community_id)

  const { image, state: imageState } = await resolveImage(post.image_url, {
    baseUrl: process.env.PUBLIC_BASE_URL,
  })

  const result = await analyzePost({
    image,
    imageState,
    input: {
      post_id: post.id,
      // The transcript is the resident's own words, spoken instead of typed,
      // so it belongs in the text Call A already reads. Labelled, and capped
      // at what PostInput.text allows. Call A's OUTPUT schema is untouched.
      text: foldVoiceIntoText(post.text, voice?.analysis ?? null),
      image_caption: null,
      community_id: post.community_id,
      community_name: geo?.name ?? null,
      time_context: buildTimeContext(post.created_at),
      lang_hint: null,
      is_incident_report: post.is_incident_report,
      reported_incident_type: null,
      taxonomy_version: taxonomy.version,
    },
  }, { taxonomy })

  if (!result.analysis) {
    // A provider refusal hides the post; any other failure leaves it pending
    // so the operator can retry rather than losing a judge's post.
    return {
      status: 'pending',
      hidden: result.hide,
      hidden_reason: result.hide ? 'auto' : null,
    }
  }

  state.analyses.set(post.id, result.analysis)
  if (voice) state.voice.set(post.id, voice)

  // docs/02 section 4.7: an incident record is created whenever the analysis
  // carries one. Hidden posts never produce incidents.
  const incident = result.analysis.incident
  if (incident.type !== 'none' && !result.hide) {
    state.incidents.set(post.id, { ...incident, post_id: post.id, community_id: post.community_id })
  }

  return {
    status: 'analyzed',
    hidden: result.hide,
    hidden_reason: result.hide ? 'auto' : null,
  }
}

const aggregatableFor = (communityId: string): AggregatablePost[] => {
  const out: AggregatablePost[] = []
  for (const post of listPosts({ community: communityId, includeHidden: true })) {
    const analysis = state.analyses.get(post.id)
    if (!analysis) continue
    out.push({
      post_id: post.id,
      user_id: post.user_id,
      created_at: post.created_at,
      hidden: post.hidden,
      status: post.status,
      analysis,
      engagement: likeCount(post.id),
    })
  }
  return out
}

/** One planning cycle for one block: aggregate, hash, Call B, validate. */
export const planOne = async (
  communityId: string, options: { force?: boolean } = {},
): Promise<{ plan: CommunityPlan; changed: boolean; called: boolean } | null> => {
  const geo = geoOf(communityId)
  if (!geo) return null

  const previous = state.cycles.get(communityId) ?? emptyCycleState()
  const result = await runCommunityCycle(geo, aggregatableFor(communityId), previous, {
    force: options.force,
  })

  state.cycles.set(communityId, result.state)
  state.plans.set(communityId, result.plan)
  return { plan: result.plan, changed: result.changed, called: result.called }
}

/**
 * The tick. docs/02 section 4.4: replan every community whose input hash
 * changed, serially, and return. The operator panel calls this every 10
 * seconds while it is open; it is the only thing replanning blocks during
 * moment 8.
 *
 * Serial on purpose. At most one Call B in flight at a time, and a tick that
 * fans out would race the next tick.
 */
export const planTick = async (options: { force?: boolean } = {}) => {
  const replanned: string[] = []
  let checked = 0
  for (const geo of loadCity()) {
    checked++
    const result = await planOne(geo.community_id, options)
    if (result?.changed) replanned.push(geo.community_id)
  }
  return { replanned, checked }
}
