import { qrPaused, setQrPaused } from '@living-city/fixtures/store'
import { badRequest, json, readJson } from '@/lib/stub'

// GET /api/operator/qr -> { paused }
// Product's own operator control, not a docs/02 section 8 contract route.
export async function GET() {
  return json({ paused: qrPaused() })
}

// POST /api/operator/qr -> { paused: boolean }
export async function POST(req: Request) {
  const body = await readJson<{ paused?: unknown }>(req)
  if (typeof body?.paused !== 'boolean') return badRequest('paused must be a boolean')
  return json({ paused: setQrPaused(body.paused) })
}
