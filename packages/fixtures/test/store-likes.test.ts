import { beforeEach, describe, expect, it } from 'vitest'
import { balance, getState, likeCount, reset, toggleLike } from '../src/store'
import { seedPosts, seedUsers } from '../src/index'

/**
 * Two things about the heart button.
 *
 * It used to credit the like and not debit the unlike, which made it a points
 * printer: tap, untap, tap again. On stage that is a judge discovering they can
 * buy the whole shop without posting anything.
 *
 * And the seed used to arrive with no likes at all, which made the feed read as
 * a fixture rather than a neighbourhood.
 */

const residents = seedUsers.filter((u) => u.role !== 'government')
const visible = seedPosts.filter((p) => !p.hidden)

describe('taking a like back', () => {
  beforeEach(() => { reset() })

  const other = seedPosts.find((p) => p.user_id !== residents[0]!.id)!
  const liker = residents[0]!.id

  it('returns the point it paid the liker', () => {
    const before = balance(liker)
    toggleLike(liker, other.id)
    expect(balance(liker)).toBe(before + 1)
    toggleLike(liker, other.id)
    expect(balance(liker)).toBe(before)
  })

  it('returns the two points it paid the author', () => {
    const before = balance(other.user_id)
    toggleLike(liker, other.id)
    expect(balance(other.user_id)).toBe(before + 2)
    toggleLike(liker, other.id)
    expect(balance(other.user_id)).toBe(before)
  })

  it('does not drift over a hundred cycles', () => {
    const l = balance(liker)
    const a = balance(other.user_id)
    for (let i = 0; i < 100; i++) {
      toggleLike(liker, other.id)
      toggleLike(liker, other.id)
    }
    expect(balance(liker), 'the liker farmed points').toBe(l)
    expect(balance(other.user_id), 'the author farmed points').toBe(a)
  })

  it('leaves the like count where it started', () => {
    const n = likeCount(other.id)
    toggleLike(liker, other.id)
    expect(likeCount(other.id)).toBe(n + 1)
    toggleLike(liker, other.id)
    expect(likeCount(other.id)).toBe(n)
  })

  it('still reports whether the post is now liked', () => {
    expect(toggleLike(liker, other.id).liked).toBe(true)
    expect(toggleLike(liker, other.id).liked).toBe(false)
  })
})

describe('the likes the seed arrives with', () => {
  beforeEach(() => { reset() })

  it('does not leave the whole feed on zero', () => {
    const withLikes = visible.filter((p) => likeCount(p.id) > 0).length
    expect(withLikes).toBeGreaterThan(visible.length * 0.9)
  })

  it('spreads them rather than giving every post the same number', () => {
    const counts = new Set(visible.map((p) => likeCount(p.id)))
    expect(counts.size).toBeGreaterThan(3)
  })

  it('never exceeds the residents who could have given them', () => {
    for (const p of visible) expect(likeCount(p.id)).toBeLessThanOrEqual(residents.length - 1)
  })

  it('leaves the balances the seed authors alone', () => {
    // Seeded likes are historical. Paying them out would silently reprice every
    // user, and the shop is balanced against the numbers in the seed.
    for (const u of seedUsers) expect(balance(u.id), u.id).toBe(u.balance)
  })

  it('has nobody liking their own post', () => {
    for (const key of getState().likes) {
      const [userId, postId] = key.split(':')
      const post = seedPosts.find((p) => p.id === postId)
      expect(post?.user_id, `${userId} liked their own ${postId}`).not.toBe(userId)
    }
  })

  it('keeps the government account out of it', () => {
    const gov = seedUsers.find((u) => u.role === 'government')!
    for (const key of getState().likes) expect(key.startsWith(`${gov.id}:`)).toBe(false)
  })

  it('gives hidden posts none', () => {
    for (const p of seedPosts.filter((p) => p.hidden)) expect(likeCount(p.id)).toBe(0)
  })

  it('is the same city every cold start', () => {
    const first = visible.map((p) => likeCount(p.id))
    reset()
    expect(visible.map((p) => likeCount(p.id))).toEqual(first)
  })
})
