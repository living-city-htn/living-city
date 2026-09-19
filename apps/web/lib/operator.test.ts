import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVersion, hidePost, planAll, presetFestival, resetDemo, tick } from './operator'

const version = { plans: { 'kw:a': 'kw:a:1' }, updated_at: '2026-09-19T00:00:00Z' }
const respond = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

afterEach(() => vi.unstubAllGlobals())

const stub = (impl: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.stubGlobal('fetch', vi.fn(impl))

describe('getVersion', () => {
  it('reads the plan map', async () => {
    stub(async () => respond(200, version))
    await expect(getVersion()).resolves.toEqual(version)
  })

  it('rejects a malformed version rather than showing a wrong plan id', async () => {
    stub(async () => respond(200, { plans: { 'kw:a': 7 }, updated_at: 'x' }))
    await expect(getVersion()).rejects.toThrow()
  })
})

describe('tick', () => {
  it('reports which blocks were replanned', async () => {
    stub(async () => respond(200, { replanned: ['kw:a'], checked: 6, version }))
    await expect(tick()).resolves.toMatchObject({ replanned: ['kw:a'], checked: 6 })
  })

  it('tolerates a missing checked count', async () => {
    stub(async () => respond(200, { replanned: [], version }))
    await expect(tick()).resolves.toMatchObject({ checked: null })
  })

  it('throws on a non-OK response so the panel can say the tick failed', async () => {
    stub(async () => respond(500, {}))
    await expect(tick()).rejects.toThrow()
  })
})

describe('the rest of the controls', () => {
  it('planAll returns the replanned ids', async () => {
    stub(async () => respond(200, { replanned: ['kw:a', 'kw:b'], version }))
    await expect(planAll()).resolves.toEqual(['kw:a', 'kw:b'])
  })

  it('presetFestival posts to the preset route for the given block', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respond(200, { plan: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await presetFestival('kw:victoria-park')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/communities/kw%3Avictoria-park/plan/preset')
  })

  it('hidePost sends the operator reason', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respond(200, { post: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await hidePost('p-001')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'operator' })
  })

  it('resetDemo surfaces a failure instead of pretending the demo was reset', async () => {
    stub(async () => respond(500, {}))
    await expect(resetDemo()).rejects.toThrow()
  })
})
