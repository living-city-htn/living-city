import { read } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson } from '@/lib/stub'
import { buildingSpecsEnabled, createBuilding, myBuildings } from '@/lib/building'

/**
 * The private building layer. Both routes are scoped to `currentUser()`; there
 * is no route anywhere that takes a user id, which is what keeps this layer
 * private rather than merely unlisted.
 */

// GET /api/me/buildings -> own buildings. Private: no route returns another's.
export async function GET() {
  return json({ buildings: await read(() => myBuildings(currentUser().id)) })
}

/** A description short enough to be about one building, long enough to be useful. */
const MAX_DESCRIPTION = 600
/** Roughly a 6 MB photo once base64 has added its third. */
const MAX_IMAGE_CHARS = 8 * 1024 * 1024

// POST /api/me/buildings -> { community_id, description, image_url? }
export async function POST(req: Request) {
  if (!buildingSpecsEnabled()) {
    return json({
      error: 'Building descriptions are not switched on for this deployment.',
      code: 'BUILDING_SPECS_OFF',
    }, 503)
  }

  const body = await readJson<{
    community_id?: string; description?: string; image_url?: string | null
  }>(req)

  if (!body?.community_id) return badRequest('community_id is required')
  const description = body.description?.trim() ?? ''
  if (!description) return badRequest('description is required')
  if (description.length > MAX_DESCRIPTION) {
    return badRequest(`description must be ${MAX_DESCRIPTION} characters or fewer`)
  }
  const imageUrl = body.image_url ?? null
  if (imageUrl && imageUrl.length > MAX_IMAGE_CHARS) {
    return badRequest('that photo is too large; try a smaller one')
  }

  const outcome = await createBuilding({
    userId: currentUser().id,
    communityId: body.community_id,
    description,
    imageUrl,
    cityName: process.env.CITY_ID === 'kw' ? 'Kitchener-Waterloo' : undefined,
  })

  // A degraded call is a state the panel renders, not an error it reports. The
  // four states map onto what the user can do about them, which is why they
  // are distinguished at all.
  if (!outcome.ok) {
    const message = outcome.degraded === 'disabled'
      ? 'The building service is not configured.'
      : outcome.degraded === 'unreadable'
        ? 'That did not come back as a building. Try describing it differently.'
        : 'The building service did not answer in time. Try again.'
    return json({ error: message, code: outcome.degraded.toUpperCase() }, 503)
  }


  return json({
    building: outcome.building,
    searched: outcome.result.searched,
    latency_ms: outcome.result.latencyMs,
  }, 201)
}
