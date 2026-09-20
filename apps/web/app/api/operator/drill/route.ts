import { drillCommunity, read, setDrillCommunity, write } from '@living-city/fixtures/store'
import { badRequest, json, readJson } from '@/lib/stub'

// GET /api/operator/drill -> { community_id: string | null }
// Product's own operator control, not a docs/02 section 8 contract route.
//
// The City Hall rehearsal used to be a card floating over the city with its own
// button, which put an operator control in front of the judges and covered the
// block behind it. It lives in the operator panel now, and the panel is its own
// route, so the state has to be somewhere both can see.
export async function GET() {
  return json({ community_id: await read(drillCommunity) })
}

// POST /api/operator/drill -> { community_id: string | null }
export async function POST(req: Request) {
  const body = await readJson<{ community_id?: unknown }>(req)
  const id = body?.community_id
  if (id !== null && typeof id !== 'string') {
    return badRequest('community_id must be a string, or null to end the drill')
  }
  return json({ community_id: await write(() => setDrillCommunity(id)) })
}
