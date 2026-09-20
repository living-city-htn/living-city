import { z } from 'zod'
import {
  DECORATION, HEIGHT_PROFILE, IDENTITY_TAG, MOOD, PALETTE, PLACE_TYPE,
  decoration, heightProfile, identityTag, mood, palette, placeType,
} from '@living-city/contracts'
import type { JsonSchema } from '../provider/types'

/**
 * `BuildingSpec` - what the model returns for a place the user described, and
 * the only thing it returns.
 *
 * THE BOUNDARY, because this is the rule most easily broken here. The model
 * never emits geometry: no vertices, no coordinates, no mesh, no transform, no
 * asset path. It emits bounded intent, exactly the way Call B emits a
 * `CommunityPlan` (docs/03 section 3) - enums from `packages/contracts` and
 * small integers. A deterministic pipeline turns this into a 3D building, and
 * that pipeline is the only thing in the repo allowed to decide shape. Adding
 * a `footprint: number[][]` here would move the line, so it is not here.
 *
 * Every field reuses an existing contracts enum rather than inventing a
 * parallel vocabulary. That is deliberate: the renderer, the plan and this spec
 * all describe the same city, and a second set of words for "brick" would drift
 * within a day.
 *
 * WHERE THIS BELONGS. This schema is the output contract of a model call, so
 * its home is `packages/contracts`. It is here instead because AGENTS.md says
 * contracts changes need the Pipeline owner plus one other, and that review has
 * not happened. Moving it is a cut-and-paste plus an export; nothing else
 * imports from this file by path.
 */

/** How sure the model is that the spec describes the real place. 0-100. */
const score = z.number().int().min(0).max(100)

export const buildingSpec = z.object({
  schema_version: z.literal('building.v1'),

  /** What the user called it, echoed back normalised. Not a search result. */
  name: z.string().min(1).max(80),
  /** One line a person would recognise the place by. */
  summary: z.string().max(200),

  kind: placeType,
  /** Mirrors Call B's vocabulary rather than raw metres. */
  height: heightProfile,
  /** 1-8. A demo block cannot hold a tower, and the renderer caps anyway. */
  storeys: z.number().int().min(1).max(8),

  palette,
  mood,
  /** Material and character, 2-4 of them, the same tags a block carries. */
  identity_tags: z.array(identityTag).min(2).max(4),
  /** What sits on or around it. Capped like a plan's decorations. */
  features: z.array(decoration).max(6),

  confidence: score,

  /**
   * The model's own answer to "do I have enough to go on?".
   *
   * When true, deterministic code runs one search and calls again with what it
   * found. The model decides; it does not reach the network itself. See
   * `search.ts` for why that split matters.
   */
  needs_reference: z.boolean(),
  /** What to search for. Null whenever `needs_reference` is false. */
  search_query: z.string().max(120).nullable(),

  /**
   * Filled by deterministic code after a search, never by the model. A spec
   * that claims sources it was not given is a spec that made them up, so the
   * validator strips whatever arrives here.
   */
  sources: z.array(z.string()).max(5),
})

export type BuildingSpec = z.infer<typeof buildingSpec>

/**
 * The `responseSchema` handed to the provider, so shape is enforced by the API
 * rather than requested in prose. Same reasoning as `call-a/schema.ts`: this is
 * the OpenAPI subset, so ranges and cross-field rules live in the validator.
 */
export const buildingSpecSchema: JsonSchema = {
  type: 'object',
  properties: {
    schema_version: { type: 'string' },
    name: { type: 'string' },
    summary: { type: 'string' },
    kind: { type: 'string', enum: [...PLACE_TYPE] },
    height: { type: 'string', enum: [...HEIGHT_PROFILE] },
    storeys: { type: 'integer' },
    palette: { type: 'string', enum: [...PALETTE] },
    mood: { type: 'string', enum: [...MOOD] },
    identity_tags: { type: 'array', items: { type: 'string', enum: [...IDENTITY_TAG] } },
    features: { type: 'array', items: { type: 'string', enum: [...DECORATION] } },
    confidence: { type: 'integer' },
    needs_reference: { type: 'boolean' },
    search_query: { type: 'string', nullable: true },
  },
  required: [
    'schema_version', 'name', 'summary', 'kind', 'height', 'storeys',
    'palette', 'mood', 'identity_tags', 'features', 'confidence',
    'needs_reference', 'search_query',
  ],
  propertyOrdering: [
    'schema_version', 'name', 'summary', 'kind', 'height', 'storeys',
    'palette', 'mood', 'identity_tags', 'features', 'confidence',
    'needs_reference', 'search_query',
  ],
}

/**
 * Validate and repair, the same contract `call-a/validate.ts` works to: a
 * near-miss is corrected and recorded rather than thrown away, because a demo
 * that shows nothing is worse than a demo that shows a slightly clamped one.
 * Only an unrepairable answer returns null.
 *
 * `sources` is not repaired, it is replaced. The caller owns it.
 */
export const validateBuildingSpec = (
  raw: unknown,
  sources: string[],
  corrections: string[] = [],
): BuildingSpec | null => {
  if (raw === null || typeof raw !== 'object') return null
  const draft = { ...(raw as Record<string, unknown>) }

  draft.schema_version = 'building.v1'
  draft.sources = sources.slice(0, 5)

  if (typeof draft.storeys === 'number') {
    const clamped = Math.min(8, Math.max(1, Math.round(draft.storeys)))
    if (clamped !== draft.storeys) {
      corrections.push(`storeys ${String(draft.storeys)} clamped to ${clamped}`)
      draft.storeys = clamped
    }
  }

  if (Array.isArray(draft.identity_tags) && draft.identity_tags.length > 4) {
    corrections.push(`identity_tags truncated from ${draft.identity_tags.length} to 4`)
    draft.identity_tags = draft.identity_tags.slice(0, 4)
  }

  if (Array.isArray(draft.features) && draft.features.length > 6) {
    corrections.push(`features truncated from ${draft.features.length} to 6`)
    draft.features = draft.features.slice(0, 6)
  }

  // A query without the flag is a query nobody asked for, and a flag without a
  // query is a search that cannot be run. Make the pair agree either way.
  if (draft.needs_reference !== true) draft.search_query = null

  const parsed = buildingSpec.safeParse(draft)
  if (parsed.success) return parsed.data
  corrections.push(`rejected: ${parsed.error.issues[0]?.message ?? 'shape'}`)
  return null
}
