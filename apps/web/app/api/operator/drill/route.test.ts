import { beforeEach, describe, expect, it } from 'vitest'
import { setDrillCommunity, write } from '@living-city/fixtures/store'
import { GET, POST } from './route'

const post = (body: unknown) =>
  POST(new Request('http://test/api/operator/drill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

beforeEach(async () => {
  await write(() => setDrillCommunity(null))
})

describe('POST /api/operator/drill', () => {
  it('starts and ends a rehearsal, and reads back what it stored', async () => {
    expect(await (await post({ community_id: 'kw:central' })).json())
      .toEqual({ community_id: 'kw:central' })
    expect(await (await GET()).json()).toEqual({ community_id: 'kw:central' })

    expect(await (await post({ community_id: null })).json()).toEqual({ community_id: null })
    expect(await (await GET()).json()).toEqual({ community_id: null })
  })

  it('refuses anything that is neither a block nor null', async () => {
    // The operator panel is the only caller, but a drill that half-starts on a
    // malformed body would be a rehearsal nobody can end from the panel.
    for (const body of [{ community_id: 7 }, { community_id: true }, {}]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(await (await GET()).json()).toEqual({ community_id: null })
  })
})

describe('GET /api/city/version', () => {
  it('carries the drill, so the app learns about it on the poll it already makes', async () => {
    const { GET: version } = await import('../../city/version/route')

    await post({ community_id: 'kw:central' })
    expect((await (await version()).json()).drill).toBe('kw:central')

    await post({ community_id: null })
    expect((await (await version()).json()).drill).toBeNull()
  })
})
