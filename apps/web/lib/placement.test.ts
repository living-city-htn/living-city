import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlacementError, loadMyCity, placeItem, removePlacement } from './placement'

const respond = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

afterEach(() => vi.unstubAllGlobals())

/** Routes by URL so the two-request load can be answered in one stub. */
const routes = (map: Record<string, Response | (() => Promise<never>)>) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const entry = Object.entries(map).find(([key]) => url.startsWith(key))
    if (!entry) throw new Error(`unexpected fetch: ${url}`)
    const value = entry[1]
    return typeof value === 'function' ? value() : value
  }))

describe('loadMyCity', () => {
  it('returns inventory, placements and balance', async () => {
    routes({
      '/api/me/placements': respond(200, {
        placements: [{ id: 'pl-1', community_id: 'kw:a', slot_id: 'slot-1', item_tag: 'benches' }],
      }),
      '/api/me': respond(200, { balance: 65, inventory: { benches: 1 } }),
    })
    const snapshot = await loadMyCity()
    expect(snapshot.balance).toBe(65)
    expect(snapshot.inventory).toEqual({ benches: 1 })
    expect(snapshot.placements).toHaveLength(1)
  })

  it('rejects a malformed inventory rather than showing wrong counts', async () => {
    routes({
      '/api/me/placements': respond(200, { placements: [] }),
      '/api/me': respond(200, { balance: 65, inventory: { benches: -2 } }),
    })
    await expect(loadMyCity()).rejects.toThrow()
  })
})

describe('placeItem', () => {
  it('returns the placement the server confirmed', async () => {
    routes({
      '/api/me/placements': respond(201, {
        ok: true,
        placement: { id: 'pl-1', community_id: 'kw:a', slot_id: 'slot-1', item_tag: 'benches' },
      }),
    })
    await expect(placeItem('kw:a', 'slot-1', 'benches')).resolves.toMatchObject({ id: 'pl-1' })
  })

  it('treats a confirmation with no id as uncertain, since it could never be removed', async () => {
    routes({
      '/api/me/placements': respond(201, {
        ok: true,
        placement: { community_id: 'kw:a', slot_id: 'slot-1', item_tag: 'benches' },
      }),
    })
    await expect(placeItem('kw:a', 'slot-1', 'benches')).rejects.toMatchObject({ uncertain: true })
  })

  it('treats a server error as uncertain so the unit is never spent twice', async () => {
    routes({ '/api/me/placements': respond(500, {}) })
    const failure = await placeItem('kw:a', 'slot-1', 'benches').catch((e) => e)
    expect(failure).toBeInstanceOf(PlacementError)
    expect(failure.uncertain).toBe(true)
  })

  it('reports a missing item as a definite failure, not an uncertain one', async () => {
    routes({ '/api/me/placements': respond(400, { error: 'not in inventory' }) })
    const failure = await placeItem('kw:a', 'slot-1', 'benches').catch((e) => e)
    expect(failure.uncertain).toBe(false)
    expect(failure.message).toMatch(/do not own/i)
  })
})

describe('removePlacement', () => {
  it('resolves when the server confirms', async () => {
    routes({ '/api/me/placements/pl-1': respond(200, { ok: true }) })
    await expect(removePlacement('pl-1')).resolves.toBeUndefined()
  })

  it('reports a 404 as a definite failure so the screen can refresh', async () => {
    routes({ '/api/me/placements/pl-1': respond(404, { error: 'not found' }) })
    const failure = await removePlacement('pl-1').catch((e) => e)
    expect(failure).toBeInstanceOf(PlacementError)
    expect(failure.uncertain).toBe(false)
  })

  it('treats a dropped connection as uncertain', async () => {
    routes({ '/api/me/placements/pl-1': () => Promise.reject(new Error('network')) })
    const failure = await removePlacement('pl-1').catch((e) => e)
    expect(failure.uncertain).toBe(true)
  })
})
