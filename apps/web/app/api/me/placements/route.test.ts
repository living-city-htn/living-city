import { beforeEach, describe, expect, it } from 'vitest'
import { getState, listShop, listSlots, placementsOf, resetDurable } from '@living-city/fixtures/store'
import { DEVICE_HEADER, resetIdentityForTests } from '@/lib/identity'
import { POST } from './route'

const requestFor = (device: string, body: Record<string, string>) => new Request(
  'https://living-city.test/api/me/placements',
  {
    method: 'POST',
    headers: { [DEVICE_HEADER]: device, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
)

const firstSlot = () => {
  const slot = listSlots()[0]
  if (!slot) throw new Error('The fixtures must contain a decoration slot')
  return slot
}

const firstItem = () => {
  const item = listShop()[0]
  if (!item) throw new Error('The fixtures must contain a shop item')
  return item
}

describe('POST /api/me/placements', () => {
  beforeEach(async () => {
    resetIdentityForTests()
    await resetDurable()
  })

  it('rejects an unknown slot without consuming the resident inventory', async () => {
    const device = 'invalid-slot-device'
    const userId = `device:${device}`
    const slot = firstSlot()
    const item = firstItem()
    getState().inventory.set(userId, new Map([[item.item_tag, 1]]))

    const response = await POST(requestFor(device, {
      community_id: slot.community_id,
      slot_id: 'not-a-real-slot',
      item_tag: item.item_tag,
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid slot' })
    expect(getState().inventory.get(userId)?.get(item.item_tag)).toBe(1)
    expect(placementsOf(userId)).toEqual([])
  })

  it('does not let one resident fill the same private slot twice', async () => {
    const device = 'duplicate-slot-device'
    const userId = `device:${device}`
    const slot = firstSlot()
    const item = firstItem()
    getState().inventory.set(userId, new Map([[item.item_tag, 2]]))
    const body = { community_id: slot.community_id, slot_id: slot.slot_id, item_tag: item.item_tag }

    const first = await POST(requestFor(device, body))
    const second = await POST(requestFor(device, body))

    expect(first.status).toBe(201)
    expect(second.status).toBe(400)
    expect(await second.json()).toEqual({ error: 'slot occupied' })
    expect(getState().inventory.get(userId)?.get(item.item_tag)).toBe(1)
    expect(placementsOf(userId)).toHaveLength(1)
  })
})
