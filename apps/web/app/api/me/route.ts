import { balance, displayNameOf, inventoryOf, read, setDisplayName, write } from '@living-city/fixtures/store'
import { badRequest, currentUser, json, readJson } from '@/lib/stub'

// GET /api/me -> user, balance, inventory
export async function GET(req: Request) {
  const user = currentUser(req)
  return json(await read(() => ({
    user: { ...user, display_name: displayNameOf(user.id) ?? user.display_name },
    // Whether the person has picked a name yet, so the app can ask once.
    named: displayNameOf(user.id) !== null,
    balance: balance(user.id), inventory: inventoryOf(user.id),
  })))
}

// PATCH /api/me { display_name } -> { user }
// Device-bound accounts with a chosen display name. docs/01 section 13.
export async function PATCH(req: Request) {
  const body = await readJson<{ display_name?: unknown }>(req)
  if (typeof body?.display_name !== 'string') return badRequest('Choose a display name.')
  const user = currentUser(req)
  const result = await write(() => setDisplayName(user.id, body.display_name as string))
  if (!result.ok) return badRequest(result.reason)
  return json({ user: { ...user, display_name: result.display_name } })
}
