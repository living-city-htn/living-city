/**
 * The personal layer: a per-user set of decoration placements in a block's
 * fixed slots (docs/01 section 8.7, docs/02 section 4.6).
 *
 * Placement moves a unit between two places that both live on the server:
 * inventory and the slot. Removal reverses it. So the same care the shop takes
 * applies here — never retry a write, and when a response cannot be trusted,
 * say so and reload rather than guessing what the server did.
 *
 * Nothing here can touch a public plan or a block's geometry. Slots are derived
 * from the block polygon, so they survive replans.
 */
import type { Placement } from '@/components/city'

export type MyCitySnapshot = {
  inventory: Record<string, number>
  placements: Placement[]
  balance: number
}

export class PlacementError extends Error {
  constructor(message: string, public readonly uncertain: boolean) {
    super(message)
    this.name = 'PlacementError'
  }
}

const uncertain = (verb: string) =>
  new PlacementError(`We could not confirm that the item was ${verb}. Refresh your city before trying again.`, true)

async function request(url: string, options?: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
    const body: unknown = await response.json().catch(() => null)
    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

const isPlacement = (v: unknown): v is Placement =>
  record(v) && typeof v.community_id === 'string' && typeof v.slot_id === 'string' &&
  typeof v.item_tag === 'string'

export async function loadMyCity(): Promise<MyCitySnapshot> {
  const [account, mine] = await Promise.all([request('/api/me'), request('/api/me/placements')])
  if (!account.response.ok || !mine.response.ok || !record(account.body) || !record(mine.body)) {
    throw new Error('Could not load your city. Try again.')
  }
  const { inventory, balance } = account.body
  const { placements } = mine.body
  if (!record(inventory) || !Object.values(inventory).every(count) || !count(balance) ||
      !Array.isArray(placements) || !placements.every(isPlacement)) {
    throw new Error('Could not load your items and placements. Try again.')
  }
  return {
    inventory: inventory as Record<string, number>,
    placements: placements as Placement[],
    balance,
  }
}

export async function placeItem(
  communityId: string,
  slotId: string,
  itemTag: string,
): Promise<Placement> {
  let result: Awaited<ReturnType<typeof request>>
  try {
    result = await request('/api/me/placements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ community_id: communityId, slot_id: slotId, item_tag: itemTag }),
    })
  } catch {
    // The request may still have consumed a unit. Do not resend it.
    throw uncertain('placed')
  }
  const { response, body } = result
  if (response.status >= 500 || response.status === 408 || !record(body)) throw uncertain('placed')
  if (!response.ok) {
    const reason = typeof body.error === 'string' ? body.error : ''
    throw new PlacementError(
      reason === 'not in inventory'
        ? 'You do not own that item any more. Refresh your city.'
        : 'That slot could not be filled. Refresh your city and try again.',
      false,
    )
  }
  const placement = body.placement
  // Without an id the item could never be removed again, so treat that as
  // an unconfirmed write rather than quietly stranding a unit in a slot.
  if (!isPlacement(placement) || typeof placement.id !== 'string') throw uncertain('placed')
  return placement
}

export async function removePlacement(placementId: string): Promise<void> {
  let result: Awaited<ReturnType<typeof request>>
  try {
    result = await request(`/api/me/placements/${encodeURIComponent(placementId)}`, { method: 'DELETE' })
  } catch {
    throw uncertain('removed')
  }
  const { response, body } = result
  if (response.status >= 500 || response.status === 408) throw uncertain('removed')
  if (!response.ok || !record(body) || body.ok !== true) {
    throw new PlacementError('That item could not be removed. Refresh your city and try again.', false)
  }
}
