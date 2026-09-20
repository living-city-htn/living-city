import { beforeEach, describe, expect, it } from 'vitest'
import { resetDurable, balance, listIncidents, listPosts } from '@living-city/fixtures/store'
import { PATCH } from './[id]/route'
import { GET } from './route'
import { DEVICE_HEADER, resetIdentityForTests } from '@/lib/identity'

const requestFor = (device: string, init: RequestInit = {}) => new Request(
  'https://living-city.test/api/civic/incidents',
  { ...init, headers: { [DEVICE_HEADER]: device, ...(init.headers ?? {}) } },
)

describe('Civic incident routes', () => {
  beforeEach(async () => {
    resetIdentityForTests('government-device')
    await resetDurable()
  })

  it('rejects a resident before reading incident records', async () => {
    const response = await GET(requestFor('resident-device'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'government access required' })
  })

  it('returns source-post context to the seeded government device', async () => {
    const response = await GET(requestFor('government-device'))
    const body = await response.json() as { incidents: Array<{ post: unknown }> }

    expect(response.status).toBe(200)
    expect(body.incidents.length).toBeGreaterThan(0)
    expect(body.incidents[0]?.post).toBeTruthy()
  })

  it('makes verification idempotent, including its points reward', async () => {
    const incident = listIncidents()[0]
    if (!incident) throw new Error('The fixture must contain an incident')
    const sourcePostId = incident.post_id
    const sourcePost = listPosts({ includeHidden: true }).find((post) => post.id === sourcePostId)
    if (!sourcePost) throw new Error('The fixture incident must have a source post')
    const before = balance(sourcePost.user_id)

    const first = await PATCH(
      requestFor('government-device', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      }),
      { params: Promise.resolve({ id: incident.id }) },
    )
    const second = await PATCH(
      requestFor('government-device', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
      }),
      { params: Promise.resolve({ id: incident.id }) },
    )

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect((await first.clone().json()).incident.status).toBe('verified')
    expect((await second.clone().json()).incident.status).toBe('verified')
    expect(balance(sourcePost.user_id)).toBe(before + 25)
  })
})
