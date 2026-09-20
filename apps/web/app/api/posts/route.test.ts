import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pipeline', () => ({
  analyzeNewPost: vi.fn(async () => ({ status: 'analyzed', hidden: false, hidden_reason: null })),
  pipelineEnabled: () => true,
}))

const jpeg = 'data:image/jpeg;base64,/9j/2wA='
const originalFixtures = process.env.USE_FIXTURES
const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN

afterEach(() => {
  if (originalFixtures === undefined) delete process.env.USE_FIXTURES
  else process.env.USE_FIXTURES = originalFixtures
  if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
  else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken
})

describe('POST /api/posts', () => {
  it('passes a validated camera photo into Call A when fixtures are disabled', async () => {
    process.env.USE_FIXTURES = '0'
    delete process.env.BLOB_READ_WRITE_TOKEN
    vi.resetModules()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    try {
      const { POST } = await import('./route')
      const response = await POST(new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'E7 atrium decorations are up tonight.',
          image_url: jpeg,
          community_id: 'kw:uw-northwest-campus',
        }),
      }))

      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.post.status).toBe('analyzed')
      expect(body.post.image_url).toBe(jpeg)
    } finally {
      info.mockRestore()
    }
  })
})
