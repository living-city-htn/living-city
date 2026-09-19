import { place, placementsOf, read, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson } from '@/lib/stub'

// GET /api/me/placements -> own placements. Private: no route returns another user's.
export async function GET() {
  return json({ placements: await read(() => placementsOf(currentUser().id)) })
}

// POST /api/me/placements -> { community_id, slot_id, item_tag }
export async function POST(req: Request) {
  const body = await readJson<{ community_id?: string; slot_id?: string; item_tag?: string }>(req)
  if (!body?.community_id || !body.slot_id || !body.item_tag) {
    return badRequest('community_id, slot_id and item_tag are required')
  }
  const { community_id, slot_id, item_tag } = body
  const result = await write(() => place(currentUser().id, community_id, slot_id, item_tag))
  return result.ok ? json(result, 201) : badRequest(result.reason)
}
