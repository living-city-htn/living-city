import type {
  AssetTaxonomy, CommunityGeo, CommunityPlan, PostAnalysis, SemanticState,
} from '@living-city/contracts'
import {
  aggregateCommunity, archetypeSignal, computeTrend, nextBaseline, nextChangeSupport,
  type AggregatablePost,
} from './aggregate'
import { buildPlanningInput, planCommunity, type PlanResult } from './call-b'
import { planningInputHash } from './hash'
import { log } from './log'
import { loadTaxonomy } from './taxonomy'

/**
 * One planning cycle for one community, end to end: analysed posts in, a
 * validated `CommunityPlan` out.
 *
 * Call A does not run here. By the time a community is replanned its posts
 * have already been analysed inline, at post time (docs/02 section 4.2). This
 * is the deterministic half - aggregate, build the input, hash it, call B,
 * validate - and it is the function `POST /api/plan/tick` drives.
 */

export type CommunityCycleState = {
  /** The long-term profile carried between windows. */
  baseline: SemanticState | null
  previousPlan: CommunityPlan | null
  consecutiveWindowsSupportingChange: number
  /** The hash of the last planning input, so an unchanged block costs nothing. */
  inputHash: string | null
}

export const emptyCycleState = (): CommunityCycleState => ({
  baseline: null,
  previousPlan: null,
  consecutiveWindowsSupportingChange: 0,
  inputHash: null,
})

export type CycleResult = PlanResult & {
  state: CommunityCycleState
  /** False when the input hash was unchanged and no call was made. */
  called: boolean
  current: SemanticState
  window: ReturnType<typeof aggregateCommunity>['window']
  contributing_post_ids: string[]
}

export type CycleOptions = {
  taxonomy?: AssetTaxonomy
  now?: Date
  /**
   * Plan even when the input hash is unchanged. The operator's manual trigger
   * sets this; the ticker does not (docs/02 section 4.4: "unchanged input means
   * no call and the previous plan stands").
   */
  force?: boolean
}

export const runCommunityCycle = async (
  geo: CommunityGeo,
  posts: readonly AggregatablePost[],
  state: CommunityCycleState,
  options: CycleOptions = {},
): Promise<CycleResult> => {
  const taxonomy = options.taxonomy ?? loadTaxonomy()
  const { window, current, contributing_post_ids } = aggregateCommunity(posts, { now: options.now })

  const trend = computeTrend(current, state.baseline)
  const signal = archetypeSignal(current, geo)
  const support = nextChangeSupport(
    state.consecutiveWindowsSupportingChange,
    signal,
    state.previousPlan?.archetype ?? null,
  )

  const input = buildPlanningInput({
    geo,
    window,
    current,
    baseline: state.baseline,
    trend,
    previousPlan: state.previousPlan,
    consecutiveWindowsSupportingChange: support,
    taxonomy,
  })
  const inputHash = planningInputHash(input)

  // The cadence rule: only a changed input earns a call.
  if (!options.force && state.inputHash === inputHash && state.previousPlan) {
    return {
      community_id: geo.community_id,
      plan: state.previousPlan,
      source: 'previous_plan',
      validator_log: [],
      input_hash: inputHash,
      changed: false,
      called: false,
      state,
      current,
      window,
      contributing_post_ids,
    }
  }

  const result = await planCommunity(input, geo, state.previousPlan, { taxonomy })

  log.info('cycle.planned', {
    community_id: geo.community_id,
    source: result.source,
    changed: result.changed,
    posts: window.post_count,
    sufficiency: window.data_sufficiency,
    archetype: result.plan.archetype,
    mood: result.plan.mood,
    corrections: result.validator_log.length,
  })

  return {
    ...result,
    called: true,
    current,
    window,
    contributing_post_ids,
    state: {
      // The baseline only advances on a window that actually held data;
      // averaging in an empty window would drag identity toward nothing.
      baseline: window.data_sufficiency === 'none'
        ? state.baseline
        : nextBaseline(state.baseline, current),
      previousPlan: result.plan,
      // Once the plan adopts the signal, the counter has done its job.
      consecutiveWindowsSupportingChange:
        result.plan.archetype === signal ? 0 : support,
      inputHash,
    },
  }
}

/** Convenience for callers holding posts and analyses separately. */
export const toAggregatable = (
  post: {
    id: string
    user_id: string
    created_at: string
    hidden: boolean
    status: 'pending' | 'analyzed'
  },
  analysis: PostAnalysis,
  engagement = 0,
): AggregatablePost => ({
  post_id: post.id,
  user_id: post.user_id,
  created_at: post.created_at,
  hidden: post.hidden,
  status: post.status,
  analysis,
  engagement,
})
