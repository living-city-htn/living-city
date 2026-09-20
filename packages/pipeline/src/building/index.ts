import { env } from '../env'
import { log } from '../log'
import { ModelError, type ImagePart, type ModelProvider } from '../provider/types'
import { getProvider } from '../provider'
import { resolveImage } from '../call-a/image'
import {
  BUILDING_REFERENCE_REMINDER, BUILDING_RETRY_REMINDER, BUILDING_SYSTEM,
} from './prompt'
import { buildingSpecSchema, validateBuildingSpec, type BuildingSpec } from './schema'
import { getSearchProvider, type SearchProvider, type SearchResult } from './search'

export * from './schema'
export * from './search'
export { BUILDING_SYSTEM } from './prompt'

/**
 * The building call. A photograph and a description of one real place in, a
 * `BuildingSpec` out, and a deterministic pipeline turns that into 3D.
 *
 * This is a third model call, after Call A and Call B. It is fenced the same
 * way the voice call is, and the fence is what makes it safe to have:
 *
 *   - It runs only when a user explicitly asks for a building on THEIR OWN
 *     private map. Nothing reaches it from the post path, the aggregator, the
 *     planner or the renderer.
 *   - Its output is private. A spec can never become a public plan, change a
 *     block's geometry or move a point (AGENTS.md, "Respect the two layers").
 *   - It emits no geometry. See `schema.ts` for where that line is drawn.
 *   - A failure is a state, not an error. Every path below returns a result
 *     the UI can render; nothing throws at the caller.
 *
 * Optionally two passes. The model says whether it has enough to go on, code
 * runs at most one search, and the model gets one chance to revise. There is no
 * third pass and no loop: see `search.ts` for why the search is not a tool.
 */

export type BuildingDegradation =
  | 'none'
  /** No key configured. The feature is off, which is a supported state. */
  | 'disabled'
  /** The model answered but never in a shape the validator accepts. */
  | 'unreadable'
  /** Timeout, transport, refusal or exhausted attempts. */
  | 'unavailable'

export type BuildingResult = {
  spec: BuildingSpec | null
  degraded: BuildingDegradation
  /** Repairs the validator made. Surfaced to the operator, not to the user. */
  corrections: string[]
  /** Whether a reference search actually ran and returned something. */
  searched: boolean
  latencyMs: number
  attempts: number
}

export type BuildingRequest = {
  /** What the user typed. The only free text the model sees. */
  description: string
  /**
   * The user's photograph, as a data URL, a remote URL or a repo-relative
   * path - `toImagePart` already handles all three for Call A.
   */
  imageUrl: string | null
  /** For the model's sense of place. Never used to rename the building. */
  cityName?: string
}

export type BuildingOptions = {
  /** Tests inject a fake. Defaults to the one critical-path provider. */
  provider?: ModelProvider
  search?: SearchProvider
}

const MAX_DESCRIPTION = 600

const payloadOf = (
  request: BuildingRequest,
  hasImage: boolean,
  reference: SearchResult[] | null,
) => ({
  description: request.description.slice(0, MAX_DESCRIPTION),
  city: request.cityName ?? null,
  photo_present: hasImage,
  reference: reference?.map((r) => ({
    title: r.title, url: r.url, snippet: r.snippet,
  })) ?? null,
})

const degradationFor = (error: ModelError): BuildingDegradation =>
  error.kind === 'config' ? 'disabled' : error.kind === 'parse' ? 'unreadable' : 'unavailable'

export const describeBuilding = async (
  request: BuildingRequest,
  options: BuildingOptions = {},
): Promise<BuildingResult> => {
  const started = Date.now()
  const corrections: string[] = []
  const provider = options.provider ?? getProvider()

  if (!provider.available()) {
    log.warn('building.degraded', { rung: 'disabled', reason: 'no provider key' })
    return {
      spec: null, degraded: 'disabled', corrections, searched: false,
      latencyMs: 0, attempts: 0,
    }
  }

  // A photograph that cannot be fetched is not fatal: docs/03 rule 9 says
  // proceed on text alone, and the model lowers its own confidence when it
  // cannot see. Same helper Call A uses, so the three image sources behave
  // identically here.
  const resolved = await resolveImage(request.imageUrl, {
    baseUrl: env.publicBaseUrl() || undefined,
  })
  const image: ImagePart | null = resolved.image
  if (resolved.state === 'missing') log.warn('building.image_unavailable', {})

  const ask = async (reference: SearchResult[] | null, extra?: string) => provider.complete({
    system: extra ? `${BUILDING_SYSTEM}\n\n${extra}` : BUILDING_SYSTEM,
    payload: payloadOf(request, image !== null, reference),
    schema: buildingSpecSchema,
    images: image ? [image] : undefined,
    model: env.buildingModel(),
    maxOutputTokens: 700,
    retryReminder: BUILDING_RETRY_REMINDER,
    timeoutMs: env.buildingTimeoutMs(),
    maxAttempts: env.buildingMaxAttempts(),
  })

  try {
    const first = await ask(null)
    const draft = validateBuildingSpec(first.json, [], corrections)

    // An unreadable first pass is the end of it. Searching to improve an answer
    // we could not read would spend latency on a guess.
    if (!draft) {
      log.warn('building.degraded', { rung: 'unreadable' })
      return {
        spec: null, degraded: 'unreadable', corrections, searched: false,
        latencyMs: Date.now() - started, attempts: first.attempts,
      }
    }

    if (!draft.needs_reference || !draft.search_query) {
      log.info('building.ok', {
        kind: draft.kind, confidence: draft.confidence, searched: false,
        latency_ms: Date.now() - started,
      })
      return {
        spec: draft, degraded: 'none', corrections, searched: false,
        latencyMs: Date.now() - started, attempts: first.attempts,
      }
    }

    // The search gets its own guard rather than riding the outer catch. A
    // lookup that throws must not turn a good first answer into a failed
    // request - the reference is an improvement, never a requirement.
    const search = options.search ?? getSearchProvider()
    let results: SearchResult[] = []
    if (search.available()) {
      try {
        results = await search.search(draft.search_query)
      } catch (e) {
        log.warn('building.search_error', {
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // Nothing came back, so there is nothing to revise with. The first answer
    // is a complete spec by rule 8 of the prompt, so ship it.
    if (results.length === 0) {
      log.info('building.ok', {
        kind: draft.kind, confidence: draft.confidence, searched: false,
        reason: 'no reference found', latency_ms: Date.now() - started,
      })
      return {
        spec: { ...draft, needs_reference: false, search_query: null },
        degraded: 'none', corrections, searched: false,
        latencyMs: Date.now() - started, attempts: first.attempts,
      }
    }

    const sources = results.map((r) => r.url)
    const second = await ask(results, BUILDING_REFERENCE_REMINDER)
    const revised = validateBuildingSpec(second.json, sources, corrections)

    // A bad second pass must not lose a good first one. Keep the draft and
    // record that the revision was discarded.
    if (!revised) {
      corrections.push('reference pass rejected; kept the first answer')
      log.warn('building.revision_rejected', { query: draft.search_query })
      return {
        spec: { ...draft, needs_reference: false, search_query: null, sources },
        degraded: 'none', corrections, searched: true,
        latencyMs: Date.now() - started, attempts: first.attempts + second.attempts,
      }
    }

    log.info('building.ok', {
      kind: revised.kind, confidence: revised.confidence, searched: true,
      latency_ms: Date.now() - started,
    })
    return {
      spec: { ...revised, needs_reference: false, search_query: null },
      degraded: 'none', corrections, searched: true,
      latencyMs: Date.now() - started, attempts: first.attempts + second.attempts,
    }
  } catch (e) {
    const error = e instanceof ModelError ? e : new ModelError(
      e instanceof Error ? e.message : 'building call failed', 'transport', 1,
    )
    const rung = degradationFor(error)
    log.warn('building.degraded', { rung, error: error.message })
    return {
      spec: null, degraded: rung, corrections, searched: false,
      latencyMs: Date.now() - started, attempts: error.attempts,
    }
  }
}
