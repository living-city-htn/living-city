import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pipeline', () => ({
  allPipelinePlans: () => [{
    community_id: 'kw:beechwood',
    plan_id: 'kw:beechwood:from-pipeline',
  }],
  pipelineEnabled: () => true,
}))

describe('GET /api/city/version', () => {
  it('reports an accepted pipeline plan so the map refetches that block', async () => {
    const { GET } = await import('./route')

    const response = await GET()
    const body = await response.json()

    expect(body.plans['kw:beechwood']).toBe('kw:beechwood:from-pipeline')
  })
})
