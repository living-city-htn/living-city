import { afterEach, describe, expect, it, vi } from 'vitest'
import { toggleLike } from './api'

afterEach(() => vi.unstubAllGlobals())
describe('like confirmation', () => {
  it('rejects an HTTP error so the optimistic UI can roll back', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'unavailable' }, { status: 503 }))
    await expect(toggleLike('post/1')).rejects.toThrow()
  })
  it('returns only a complete confirmed balance and like state', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ liked: true, likes: 3, balance: 90 }))
    expect(await toggleLike('post/1')).toEqual({ liked: true, likes: 3, balance: 90 })
  })
  it('rejects malformed success without silently inventing a balance', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ liked: true, likes: 3 }))
    await expect(toggleLike('post/1')).rejects.toThrow()
  })
})
