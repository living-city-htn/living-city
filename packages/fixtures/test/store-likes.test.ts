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

describe('what the heart pays', () => {
  beforeEach(() => { reset() })

  const other = seedPosts.find((p) => p.user_id !== residents[0]!.id)!
  const liker = residents[0]!.id
  /** A post this liker has not already liked in the seed, so it can still pay. */
  const fresh = () => seedPosts.find((p) => p.user_id !== liker && !getState().likes.has(`${liker}:${p.id}`))!

  it('pays the liker a point for interacting', () => {
    const p = fresh()
    const before = balance(liker)
    toggleLike(liker, p.id)
    expect(balance(liker)).toBe(before + 1)
  })

  it('pays the author two', () => {
    const p = fresh()
    const before = balance(p.user_id)
    toggleLike(liker, p.id)
    expect(balance(p.user_id)).toBe(before + 2)
  })

  it('does not take the points back when the like is cancelled', () => {
    const p = fresh()
    const l = balance(liker)
    const a = balance(p.user_id)
    toggleLike(liker, p.id)
    toggleLike(liker, p.id)
    expect(balance(liker), 'changing your mind must not cost the liker').toBe(l + 1)
    expect(balance(p.user_id), 'changing your mind must not cost the author').toBe(a + 2)
  })

  it('pays nothing for liking the same post a second time', () => {
    const p = fresh()
    toggleLike(liker, p.id)
    const l = balance(liker)
    const a = balance(p.user_id)
    toggleLike(liker, p.id)                           // unlike
    toggleLike(liker, p.id)                           // like again
    expect(balance(liker)).toBe(l)
    expect(balance(p.user_id)).toBe(a)
  })

  it('pays exactly once across a hundred cycles', () => {
    const p = fresh()
    const l = balance(liker)
    const a = balance(p.user_id)
    for (let i = 0; i < 100; i++) {
      toggleLike(liker, p.id)
      toggleLike(liker, p.id)
    }
    expect(balance(liker), 'the liker farmed points').toBe(l + 1)
    expect(balance(p.user_id), 'the author farmed points').toBe(a + 2)
  })

  it('is bounded by the posts in the city, not by how long you tap', () => {
    const before = balance(liker)
    const likeable = seedPosts.filter((p) => p.user_id !== liker)
    for (let round = 0; round < 3; round++) {
      for (const p of likeable) {
        toggleLike(liker, p.id)
        toggleLike(liker, p.id)
      }
    }
    // Three passes over every post, and still at most one point per post.
    const alreadyPaid = likeable.filter((p) => getState().likes.has(`${liker}:${p.id}`)).length
    expect(balance(liker) - before).toBeLessThanOrEqual(likeable.length - alreadyPaid)
  })

  it('still toggles the like count both ways', () => {
    const p = fresh()
    const n = likeCount(p.id)
    expect(toggleLike(liker, p.id).liked).toBe(true)
    expect(likeCount(p.id)).toBe(n + 1)
    expect(toggleLike(liker, p.id).liked).toBe(false)
    expect(likeCount(p.id)).toBe(n)
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
