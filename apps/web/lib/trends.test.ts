import { describe, expect, it } from 'vitest'
import { computeTrends, type TrendAnalysis } from './trends'

const dayOf = (iso: string | Date) => new Date(iso).toISOString().slice(0, 10)
const now = Date.parse('2026-09-10T12:00:00Z')

const analyses: Record<string, TrendAnalysis> = {
  a: { valence: 20, dimensions: { energy: 80, calm: null }, tags: ['patio', 'music'] },
  b: { valence: 60, dimensions: { energy: 40, calm: 90 }, tags: ['patio'] },
}

const run = (days = 4) => computeTrends({
  posts: [
    { id: 'a', community_id: 'x', created_at: '2026-09-07T12:00:00Z' },
    { id: 'b', community_id: 'x', created_at: '2026-09-10T09:00:00Z' },
    { id: 'c', community_id: 'x', created_at: '2026-09-10T10:00:00Z' },
    { id: 'old', community_id: 'x', created_at: '2026-08-01T10:00:00Z' },
    { id: 'd', community_id: 'y', created_at: '2026-09-09T10:00:00Z' },
  ],
  analysisOf: (id) => analyses[id] ?? null,
  communities: [{ community_id: 'x', name: 'Uptown' }, { community_id: 'y', name: 'Laurelwood' }, { community_id: 'z', name: 'Quiet' }],
  moodOf: (id) => (id === 'x' ? 'vibrant' : null),
  days, now, dayOf,
})

describe('computeTrends', () => {
  it('counts posts in the window only, analysed or not', () => {
    const x = run().communities.find((c) => c.community_id === 'x')!
    expect(x.posts).toBe(3)
    expect(x.analysed).toBe(2)
  })

  it('averages valence and shows its change across the window', () => {
    const x = run().communities.find((c) => c.community_id === 'x')!
    expect(x.valence).toBe(40)
    expect(x.valence_change).toBe(40)
  })

  it('ranks dimensions and tags, ignoring nulls', () => {
    const x = run().communities.find((c) => c.community_id === 'x')!
    expect(x.dimensions[0]).toEqual({ name: 'calm', value: 90 })
    expect(x.dimensions.find((d) => d.name === 'energy')?.value).toBe(60)
    expect(x.top_tags[0]).toEqual({ tag: 'patio', count: 2 })
  })

  it('has one point per day, and zeros for quiet communities', () => {
    const t = run()
    expect(t.days).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'])
    const z = t.communities.find((c) => c.community_id === 'z')!
    expect(z.daily.map((d) => d.posts)).toEqual([0, 0, 0, 0])
    expect(z.valence).toBeNull()
    expect(t.communities.at(-1)?.community_id).toBe('z')
  })

  it('carries the plan mood', () => {
    expect(run().communities.find((c) => c.community_id === 'x')?.mood).toBe('vibrant')
  })
})
