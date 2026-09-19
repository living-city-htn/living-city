import { balance, inventoryOf } from '@living-city/fixtures/store'
import { currentUser, json } from '@/lib/stub'

// GET /api/me -> user, balance, inventory
export async function GET() {
  const user = currentUser()
  return json({ user, balance: balance(user.id), inventory: inventoryOf(user.id) })
}
