import {
  planningInput, toPlanningGeo,
  type AssetTaxonomy, type CommunityGeo, type CommunityPlan, type PlanningInput,
  type SemanticState,
} from '@living-city/contracts'
import { env } from '../env'
import { planningInputHash } from '../hash'
import { log } from '../log'
import { getProvider, withCallBLock } from '../provider'
import { loadTaxonomy } from '../taxonomy'
import { zoningDefaultPlan } from './fallback'
import { CALL_B_RETRY_REMINDER, callBSystemPrompt } from './prompt'
import { communityPlanSchema } from './schema'
import { validateCommunityPlan, type ValidateContext } from './validate'

export * from './fallback'
export { validateCommunityPlan, type ValidateContext, type ValidateResult } from './validate'
export { callBSystemPrompt } from './prompt'
export { communityPlanSchema } from './schema'

/**
 * Call B: one community's geography and aggregated state in, one validated
 * `CommunityPlan` out. docs/03 sections 2.3, 3.2, 4.2.
 *
 * This is the JSON the renderer builds a block from. It carries no geometry,
 * no coordinates and no asset counts - only intent, which Module 4 turns into
 * a block deterministically.
 */

export type BuildPlanningInputArgs = {
  geo: CommunityGeo
  window: PlanningInput['window']
  current: SemanticState
  baseline: SemanticState | null
  trend: PlanningInput['trend']
  previousPlan: CommunityPlan | null
  consecutiveWindowsSupportingChange: number
  taxonomy?: AssetTaxonomy
}

/**
 * Assemble the input. The one thing that must not go wrong here is geography:
 * `toPlanningGeo` keeps the ->B subset only, so polygons never reach the model
 * (docs/03 section 2.1).
 */
export const buildPlanningInput = (args: BuildPlanningInputArgs): PlanningInput => {
  const taxonomy = args.taxonomy ?? loadTaxonomy()
  return planningInput.parse({
    schema_version: '1.0',
    taxonomy_version: taxonomy.version,
    community: toPlanningGeo(args.geo),
    window: args.window,
    current: args.current,
    baseline: args.baseline,
    trend: args.trend,
    previous_plan: args.previousPlan,
    consecutive_windows_supporting_change: args.consecutiveWindowsSupportingChange,
    taxonomy,
  })
}

export type PlanResult = {
  community_id: string
  plan: CommunityPlan
  /** Where the plan came from, for the operator panel and the logs. */
  source: 'model' | 'previous_plan' | 'zoning_default'
  validator_log: string[]
  input_hash: string
  changed: boolean
  error?: string
  raw?: unknown
  meta?: { model: string; attempts: number; latency_ms: number }
}

export type PlanOptions = {
  taxonomy?: AssetTaxonomy
  /** Defaults to `<community_id>:<window.end>`, per docs/03 section 3.2. */
  planId?: string
}

/**
 * Run one planning cycle for one community.
 *
 * Never throws and never returns nothing: a failed call keeps the previous
 * plan, and a community with no previous plan gets its zoning default. A block
 * always has something to render.
 */
export const planCommunity = async (
  input: PlanningInput,
  geo: CommunityGeo,
  previousPlan: CommunityPlan | null,
  options: PlanOptions = {},
): Promise<PlanResult> => {
  const taxonomy = options.taxonomy ?? loadTaxonomy()
  const planId = options.planId ?? `${geo.community_id}:${input.window.end}`
  const inputHash = planningInputHash(input)

  const keepPrevious = (reason: string, validatorLog: string[], raw?: unknown): PlanResult => {
    log.warn('call_b.kept_previous', { community_id: geo.community_id, reason })
    return {
      community_id: geo.community_id,
      plan: previousPlan ?? zoningDefaultPlan(geo, taxonomy, planId, reason),
      source: previousPlan ? 'previous_plan' : 'zoning_default',
      validator_log: validatorLog,
      input_hash: inputHash,
      changed: false,
      error: reason,
      raw,
    }
  }

  let response
  try {
    // docs/02 section 4.4: at most one Call B in flight at a time.
    response = await withCallBLock(() =>
      getProvider().complete({
        system: callBSystemPrompt(taxonomy),
        payload: { ...input, taxonomy: undefined },
        schema: communityPlanSchema,
        model: env.modelCallB(),
        maxOutputTokens: env.maxTokensCallB(),
        retryReminder: CALL_B_RETRY_REMINDER,
      }),
    )
  } catch (error) {
    return keepPrevious(error instanceof Error ? error.message : String(error), [])
  }

  const result = validateCommunityPlan(response.json, {
    geo,
    taxonomy,
    previousPlan,
    dataSufficiency: input.window.data_sufficiency,
    consecutiveWindowsSupportingChange: input.consecutive_windows_supporting_change,
    planId,
  } satisfies ValidateContext)

  if (result.log.length > 0) {
    log.warn('call_b.corrections', {
      community_id: geo.community_id,
      count: result.log.length,
      corrections: result.log,
    })
  }

  if (!result.ok) return keepPrevious(result.reason, result.log, response.json)

  return {
    community_id: geo.community_id,
    plan: result.plan,
    source: 'model',
    validator_log: result.log,
    input_hash: inputHash,
    changed: JSON.stringify(previousPlan) !== JSON.stringify(result.plan),
    raw: response.json,
    meta: {
      model: response.model,
      attempts: response.attempts,
      latency_ms: response.latencyMs,
    },
  }
}
