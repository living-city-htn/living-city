import { beforeEach, describe, expect, it } from 'vitest'
import { balance, getState, likeCount, listPosts, resetDurable } from '@living-city/fixtures/store'
import { DEVICE_HEADER, resetIdentityForTests } from '@/lib/identity'
import { POST } from './route'

const requestFor = (device: string) => new Request(
  'https://living-city.test/api/posts/post/like',
  { method: 'POST', headers: { [DEVICE_HEADER]: device } },
)

const callLike = (device: string, id: string) =>
  POST(requestFor(device), { params: Promise.resolve({ id }) })

describe('POST /api/posts/:id/like', () => {
  beforeEach(async () => {
    resetIdentityForTests()
    await resetDurable()
  })

  it('does not create a like or award points for a missing post', async () => {
    const device = 'missing-post-device'
    const userId = `device:${device}`
    const before = balance(userId)

    const response = await callLike(device, 'not-a-post')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'post not found' })
    expect(balance(userId)).toBe(before)
    expect(likeCount('not-a-post')).toBe(0)
  })

  it('rejects a self-like without awarding either side', async () => {
    const device = 'self-like-device'
    const userId = `device:${device}`
    const post = listPosts({ includeHidden: true })[0]
    if (!post) throw new Error('The fixtures must contain a post')
    post.user_id = userId
    const before = balance(userId)
    const likesBefore = likeCount(post.id)

    const response = await callLike(device, post.id)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'cannot like own post' })
    expect(balance(userId)).toBe(before)
    expect(likeCount(post.id)).toBe(likesBefore)
  })

  it('credits each side only once when a like is toggled off and back on', async () => {
    const device = 'repeat-like-device'
    const userId = `device:${device}`
    const post = listPosts({ includeHidden: true })[0]
    if (!post) throw new Error('The fixtures must contain a post')
    const likerBefore = balance(userId)
    const authorBefore = balance(post.user_id)
    const likesBefore = likeCount(post.id)

    const first = await callLike(device, post.id)
    const second = await callLike(device, post.id)
    const third = await callLike(device, post.id)

    expect(await first.json()).toEqual({ liked: true, likes: likesBefore + 1, balance: likerBefore + 1 })
    expect(await second.json()).toMatchObject({ liked: false, likes: likesBefore })
    expect(await third.json()).toMatchObject({ liked: true, likes: likesBefore + 1 })
    expect(balance(userId)).toBe(likerBefore + 1)
    expect(balance(post.user_id)).toBe(authorBefore + 2)
    expect(getState().likes.has(`${userId}:${post.id}`)).toBe(true)
  })
})
