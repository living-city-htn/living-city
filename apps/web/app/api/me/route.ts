import { balance, inventoryOf, read } from '@living-city/fixtures/store'
import { currentUser, json } from '@/lib/stub'

// GET /api/me -> user, balance, inventory
export async function GET(req: Request) {
  const user = currentUser(req)
  return json(await read(() => ({
    user, balance: balance(user.id), inventory: inventoryOf(user.id),
  })))
}
