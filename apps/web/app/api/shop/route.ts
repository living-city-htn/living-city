import { listShop } from '@living-city/fixtures/store'
import { json } from '@/lib/stub'

// GET /api/shop -> catalog. Real items come from 3D's asset manifest at Gate 0.
export async function GET() {
  return json({ items: listShop() })
}
