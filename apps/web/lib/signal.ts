/**
 * The seam between the web app and `packages/signal`, mirroring what
 * `lib/pipeline.ts` does for `packages/pipeline`.
 *
 * Everything here is inert unless `SIGNAL_LAYER` is on. With the flag off,
 * `ingestPost` and `removeFromSignal` return immediately, no env var is read,
 * no index is touched and no embedding is generated - the post flow, the
 * aggregator, Call B and the renderer behave exactly as they did before this
 * file existed.
 *
 * The one thing worth knowing about the current architecture: `PostAnalysis`
 * records live in `lib/pipeline.ts` module memory and only exist when the
 * pipeline is on (`USE_FIXTURES=0` with a key). With fixtures serving, there
 * are no analyses to index, so the signal layer indexes nothing from new posts
 * and the seeded corpus comes from `pnpm signal:backfill` instead. That is a
 * property of the stub, not of this layer.
 */
import type { Incident, PostAnalysis } from '@living-city/contracts'
import { getState, listCommunities, likeCount, listIncidents, listPosts } from '@living-city/fixtures/store'
import {
  backfill, indexPost, removePost, setCivicReadPort, setCivicWritePort, signalEnv,
  type BackfillRow, type EvidenceRecord, type IndexableBlock, type IndexablePost,
} from '@living-city/signal'
import { analysisOf } from '@/lib/pipeline'

/** The one switch, re-exported so routes do not each reach into the package. */
export const signalEnabled = (): boolean => signalEnv.enabled()

/**
 * What the block contributes to a document. `CommunityGeo` carries the official
 * area it was derived from as `source` plus the id itself; the drawn block id
 * is the `community_id` and is indexed separately, so a judge asking "which
 * ward" gets an answer that is not the demo's own geometry.
 */
const blockOf = (communityId: string): IndexableBlock | undefined => {
  const geo = listCommunities().find((c) => c.community_id === communityId)
  if (!geo) return undefined
  return {
    official_area_id: geo.source === 'synthetic' ? null : geo.community_id,
    area_source: geo.source,
    city_id: geo.city_id,
  }
}

const toIndexable = (post: {
  id: string; user_id: string; text: string; image_url?: string | null
  lon: number; lat: number; created_at: string; community_id: string
  is_incident_report: boolean; hidden: boolean
}): IndexablePost => post

/**
 * Index one post. **Deliberately not awaited by the post handler.**
 *
 * The post has already been created and the response is already going out; an
 * Elasticsearch write must not sit between a post being created and the block
 * rebuilding. Errors are swallowed inside the package, so this cannot reject.
 */
export const ingestPost = (
  post: Parameters<typeof toIndexable>[0],
  analysis: PostAnalysis,
): void => {
  if (!signalEnabled()) return
  void indexPost(toIndexable(post), analysis, {
    block: blockOf(post.community_id),
    engagement: likeCount(post.id),
  })
}

/**
 * What the post handler calls: one line, after Call A has returned and any
 * auto-hide has been applied. Looks the analysis up itself so the route does
 * not have to learn where analyses live.
 *
 * A post with no analysis (Call A failed, or fixtures are serving) is not
 * indexed. The index holds evidence, and an unanalysed post is not yet evidence.
 */
export const ingestAnalyzedPost = (post: Parameters<typeof toIndexable>[0]): void => {
  if (!signalEnabled()) return
  if (post.hidden) return
  const analysis = analysisOf(post.id)
  if (!analysis) return
  ingestPost(post, analysis)
}

/**
 * Remove a hidden post from the index, awaited inside the hide request so the
 * promise hide-post makes - gone from every surface now - covers the evidence
 * index too. Never throws; a hide succeeds against a dead cluster and the
 * document is removed by the next backfill.
 */
export const removeFromSignal = async (postId: string): Promise<void> => {
  if (!signalEnabled()) return
  await removePost(postId)
}

/**
 * Every post the process can currently pair with an analysis. Hidden posts are
 * included on purpose: `backfill` deletes them from the index, which is what
 * makes it the repair path for a hide whose delete failed.
 */
export const collectBackfillRows = (): BackfillRow[] => {
  const rows: BackfillRow[] = []
  for (const post of listPosts({ includeHidden: true })) {
    const analysis = analysisOf(post.id)
    if (!analysis) continue
    rows.push({
      post: toIndexable(post),
      analysis,
      block: blockOf(post.community_id),
      engagement: likeCount(post.id),
    })
  }
  return rows
}

export const runBackfill = () => backfill(collectBackfillRows())

/**
 * The store fallback every read path in `packages/signal` uses when
 * Elasticsearch is unavailable. Registered once, at module load, so importing
 * this file anywhere in a route is enough to make the fallback exist.
 *
 * It reads the same two places the rest of the app reads - the fixture store
 * for rows, `lib/pipeline.ts` for analyses - which is what makes "the civic
 * page falls back to the existing queries" literally true rather than a second
 * implementation that can drift.
 */
setCivicReadPort({
  listEvidence: ({ blockId, since, limit = 500 }) => {
    const rows: EvidenceRecord[] = []
    for (const post of listPosts({ community: blockId })) {
      if (since && post.created_at < since) continue
      const analysis = analysisOf(post.id)
      if (!analysis) continue
      rows.push({
        post: toIndexable(post),
        analysis,
        block: blockOf(post.community_id),
        engagement: likeCount(post.id),
      })
      if (rows.length >= limit) break
    }
    return rows
  },

  listIncidents: (filter) => listIncidents({
    community: filter?.community,
    status: filter?.status,
  }) as Incident[],
})

/**
 * The write port. Every action the agent takes lands here.
 *
 * It writes into the same `state.incidents` array that `GET /api/civic/incidents`
 * reads, through the store's own exported `getState()`, rather than keeping a
 * second incident list. One store means the government page shows agent rows
 * and human rows side by side with no merge step, and no chance of the two
 * drifting. `packages/fixtures` is Product's package, so this reaches for the
 * exported state rather than adding functions to it - when the migrations land,
 * this object is the only thing that changes.
 *
 * Nothing here can touch a post, a plan, a placement or a block. The port has
 * no method for it, which is the point.
 */
/** The store's own incident row type, which widens `type` to string. */
type StoreIncident = ReturnType<typeof getState>['incidents'][number]

let agentSeq = 0

setCivicWritePort({
  getIncident: (id) => (getState().incidents.find((i) => i.id === id) as Incident | undefined) ?? null,

  getIncidentByPost: (postId) =>
    (getState().incidents.find((i) => i.post_id === postId) as Incident | undefined) ?? null,

  getPost: (postId) => {
    const post = listPosts({ includeHidden: true }).find((p) => p.id === postId)
    return post ? toIndexable(post) : null
  },

  createIncident: (input) => {
    agentSeq += 1
    const now = new Date().toISOString()
    const incident: Incident = {
      id: `inc-agent-${String(agentSeq).padStart(3, '0')}`,
      post_id: input.post_id,
      community_id: input.community_id,
      type: input.type,
      severity: input.severity,
      location_hint: input.location_hint,
      reported_at: input.reported_at,
      source: input.source,
      status: 'reported',
      staff_note: null,
      updated_at: now,
    }
    // One cast at the boundary: the store's own Incident type widens `type` to
    // string, contracts keeps it as the enum. Same shape, stricter here.
    getState().incidents.push(incident as unknown as StoreIncident)
    return incident
  },

  patchIncident: (id, patch) => {
    const incident = getState().incidents.find((i) => i.id === id)
    if (!incident) return null
    if (patch.severity !== undefined) incident.severity = patch.severity
    if (patch.status !== undefined) incident.status = patch.status
    if (patch.staff_note !== undefined) incident.staff_note = patch.staff_note
    incident.updated_at = new Date().toISOString()
    return incident as unknown as Incident
  },
})
