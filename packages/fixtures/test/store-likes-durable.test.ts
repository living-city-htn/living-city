import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Serialized } from '../src/persist'

/**
 * The record of who has already been paid for a like has to travel in the
 * durable row.
 *
 * If it does not, a hydrate between two taps forgets, and the heart goes back
 * to printing points - which is exactly the state moment 8 is in, with every
 * request landing on whichever instance answers it.
 */

const db = { row: null as { data: Serialized; version: number } | null }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

vi.mock('../src/persist', () => ({
  durable: () => true,
  load: async () => (db.row ? { data: clone(db.row.data), version: db.row.version } : null),
  save: async (data: Serialized, version: number) => {
    const snapshot = clone(data)
    if (!db.row) { if (version !== 0) return false; db.row = { data: snapshot, version: 1 }; return true }
    if (db.row.version !== version) return false
    db.row = { data: snapshot, version: db.row.version + 1 }
    return true
  },
  overwrite: async (data: Serialized) => {
    db.row = { data: clone(data), version: (db.row?.version ?? 0) + 1 }
  },
}))

const { balance, getState, resetDurable, toggleLike, write } = await import('../src/store')
const { seedPosts, seedUsers } = await import('../src/index')

const liker = seedUsers.find((u) => u.role !== 'government')!.id

describe('the payout ledger in the durable row', () => {
  beforeEach(async () => { db.row = null; await resetDurable() })

  /** A post this liker has not already liked in the seed, so it can still pay. */
  const fresh = () => seedPosts.find((p) => p.user_id !== liker && !getState().likes.has(`${liker}:${p.id}`))!

  it('is carried in the serialised row', async () => {
    const post = fresh()
    await write(() => toggleLike(liker, post.id))
    expect(db.row!.data.rewardedLikes).toContain(`${liker}:${post.id}`)
  })

  it('survives the seed, so historical likes cannot be re-earned', async () => {
    const seeded = [...getState().likes][0]!
    expect(db.row!.data.rewardedLikes).toContain(seeded)
  })

  it('stops the heart printing across a hydrate between taps', async () => {
    const post = fresh()
    const opening = balance(liker)
    // Every tap is its own request, and every request re-reads the row.
    for (let i = 0; i < 20; i++) {
      await write(() => toggleLike(liker, post.id))
      await write(() => toggleLike(liker, post.id))
    }
    await write(() => toggleLike(liker, post.id))
    expect(balance(liker), 'the heart printed points across hydrates').toBe(opening + 1)
  })
})
