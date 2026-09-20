/**
 * The seam between the web app and the building call, mirroring what
 * `lib/pipeline.ts` does for Call A and Call B.
 *
 * Everything here belongs to the PRIVATE layer. A building described on this
 * path is stored against one user, returned to that user only, and can never
 * become a public plan or change a block's geometry (AGENTS.md, "Respect the
 * two layers"). That is enforced in two places rather than one: the store's
 * `buildingsOf` filters by user, and no route in the app returns another
 * user's rows.
 *
 * The feature is off unless `BUILDING_SPECS=1` and a provider key is set, the
 * same shape of switch `pipelineEnabled()` uses. With it off the route answers
 * 503 and the panel never draws the form, so the app is exactly what it is
 * today.
 */
import {
  buildingSpec, describeBuilding,
  type BuildingResult, type BuildingSpec,
} from '@living-city/pipeline'
import { addBuilding, buildingsOf, write, type UserBuilding } from '@living-city/fixtures/store'

/** The one switch. */
export const buildingSpecsEnabled = (): boolean =>
  process.env.BUILDING_SPECS === '1'
  && !!(process.env.AI_PROVIDER === 'gemini'
    ? process.env.GEMINI_API_KEY
    : process.env.OPENAI_API_KEY)

/**
 * A stored row with its spec typed.
 *
 * The store keeps `spec` as `unknown` to avoid a dependency cycle, so this is
 * where it becomes a `BuildingSpec` again. Parsing rather than casting is the
 * point: a row written by an older build, or hand-edited in the database, is
 * dropped instead of crashing the panel.
 */
export type TypedBuilding = Omit<UserBuilding, 'spec'> & { spec: BuildingSpec }

const typed = (row: UserBuilding): TypedBuilding | null => {
  const parsed = buildingSpec.safeParse(row.spec)
  return parsed.success ? { ...row, spec: parsed.data } : null
}

/** Own buildings only. There is no route that takes a user id. */
export const myBuildings = (userId: string): TypedBuilding[] =>
  buildingsOf(userId).flatMap((row) => {
    const t = typed(row)
    return t ? [t] : []
  })

export type CreateBuildingInput = {
  userId: string
  communityId: string
  description: string
  imageUrl: string | null
  cityName?: string
}

export type CreateBuildingOutcome =
  | { ok: true; building: TypedBuilding; result: BuildingResult }
  | { ok: false; degraded: BuildingResult['degraded']; result: BuildingResult }

/**
 * Describe one building and store it against the user.
 *
 * The photograph is NOT stored with the spec when it arrives as a data URL.
 * A phone photo is megabytes and the whole demo state travels as one JSONB row
 * on every request (`packages/fixtures/src/persist.ts`) - putting images in
 * there would make every read slower for everyone. A hosted URL is kept, an
 * inline one is dropped once the model has seen it, and the card falls back to
 * drawing from the spec.
 *
 * The model call happens OUTSIDE `write`. `write` re-runs its callback until
 * the optimistic-concurrency save lands - up to four times - so a model call
 * inside it would bill four times and take a minute under two concurrent
 * users. Only the store mutation goes in.
 */
export const createBuilding = async (
  input: CreateBuildingInput,
): Promise<CreateBuildingOutcome> => {
  const result = await describeBuilding({
    description: input.description,
    imageUrl: input.imageUrl,
    cityName: input.cityName,
  })

  if (!result.spec) return { ok: false, degraded: result.degraded, result }

  const keepable = input.imageUrl && !input.imageUrl.startsWith('data:')
    ? input.imageUrl
    : null

  const spec = result.spec
  const { building } = await write(() => addBuilding({
    user_id: input.userId,
    community_id: input.communityId,
    slot_id: null,
    name: spec.name,
    spec,
    image_url: keepable,
  }))

  const t = typed(building)
  // `addBuilding` just stored a spec this function validated, so this cannot
  // fail; the branch exists so the types stay honest rather than asserted.
  return t
    ? { ok: true, building: t, result }
    : { ok: false, degraded: 'unreadable', result }
}
