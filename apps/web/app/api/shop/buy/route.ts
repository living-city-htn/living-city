import { buy, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson } from '@/lib/stub'

// POST /api/shop/buy -> { item_tag } debit and add to inventory
export async function POST(req: Request) {
  const body = await readJson<{ item_tag?: string }>(req)
  if (!body?.item_tag) return badRequest('item_tag is required')
  const tag = body.item_tag
  const result = await write(() => buy(currentUser(req).id, tag))
  return result.ok ? json(result) : badRequest(result.reason ?? 'purchase failed')
}
