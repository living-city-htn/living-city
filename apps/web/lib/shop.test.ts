import { afterEach, describe, expect, it, vi } from 'vitest'
import { purchaseItem } from './shop'

afterEach(() => vi.unstubAllGlobals())
describe('shop purchase', () => {
  it('uses the server-confirmed balance and sends the chosen item', async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(JSON.parse(options.body as string)).toEqual({ item_tag: 'benches' })
      return Response.json({ ok: true, balance: 15 })
    })
    vi.stubGlobal('fetch', fetcher)
    expect(await purchaseItem('benches')).toEqual({ balance: 15 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not treat a rejected purchase as a success', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'insufficient balance' }, { status: 400 }))
    await expect(purchaseItem('fountain')).rejects.toThrow(/points|balance/i)
  })
  it('does not invent a balance when the server response is malformed', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ok: true }))
    await expect(purchaseItem('benches')).rejects.toThrow(/confirm/i)
  })
  it('does not retry an uncertain purchase after a connection failure', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('network unavailable') })
    vi.stubGlobal('fetch', fetcher)
    await expect(purchaseItem('benches')).rejects.toThrow(/confirm/i)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects an explicit failure even with a successful HTTP status', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ok: false, balance: 30, reason: 'unknown item' }))
    await expect(purchaseItem('benches')).rejects.toThrow()
  })
})
