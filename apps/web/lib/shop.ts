import type { ShopItem } from '@living-city/fixtures'

export type ShopSnapshot = {
  items: ShopItem[]
  balance: number
  inventory: Record<string, number>
}

export class PurchaseError extends Error {
  constructor(message: string, public readonly uncertain: boolean) {
    super(message)
    this.name = 'PurchaseError'
  }
}

const uncertainPurchase = () => new PurchaseError(
  'We could not confirm this purchase. Refresh your balance and owned items before buying again.', true,
)

async function request(url: string, options?: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
    const body: unknown = await response.json()
    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const quantity = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export async function loadShop(): Promise<ShopSnapshot> {
  const [catalog, account] = await Promise.all([request('/api/shop'), request('/api/me')])
  if (!catalog.response.ok || !account.response.ok || !record(catalog.body) || !record(account.body)) {
    throw new Error('The shop could not load. Try again.')
  }
  const { items } = catalog.body
  const { balance, inventory } = account.body
  if (!Array.isArray(items) || !items.every(item => record(item) &&
      typeof item.item_tag === 'string' && typeof item.label === 'string' &&
      typeof item.category === 'string' && quantity(item.price)) ||
      !quantity(balance) || !record(inventory) || !Object.values(inventory).every(quantity)) {
    throw new Error('The shop could not load your items and balance. Try again.')
  }
  return { items: items as ShopItem[], balance, inventory: inventory as Record<string, number> }
}

export async function purchaseItem(itemTag: string): Promise<{ balance: number }> {
  let result: Awaited<ReturnType<typeof request>>
  try {
    result = await request('/api/shop/buy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_tag: itemTag }),
    })
  } catch {
    // A failed response does not prove the server did not charge the account.
    // Never retry a purchase automatically.
    throw uncertainPurchase()
  }
  const { response, body } = result
  if (response.status >= 500 || response.status === 408 || !record(body)) throw uncertainPurchase()
  if (!response.ok || body.ok === false) {
    const reason = body.error ?? body.reason
    throw new PurchaseError(reason === 'insufficient balance'
      ? 'You do not have enough points. Refresh your balance before buying again.'
      : 'This item could not be purchased. Refresh the shop and try again.', false)
  }
  if (body.ok !== true || !quantity(body.balance)) throw uncertainPurchase()
  return { balance: body.balance }
}
