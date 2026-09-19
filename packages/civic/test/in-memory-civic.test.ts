import { describe, expect, it } from 'vitest'
import { createInMemoryCivic } from '../src/index'

const timestamp = '2026-09-19T12:00:00.000Z'
const post = {
  id: 'post-1',
  community_id: 'kw:victoria-park',
  hidden: false,
  created_at: timestamp,
}
const flooding = {
  incident: {
    type: 'flooding' as const,
    severity: 2 as const,
    location_hint: 'Near the playground',
    evidence: 'observed' as const,
  },
}

describe('the in-memory Civic fallback', () => {
  it('creates one deterministic incident from a visible analysis', () => {
    const civic = createInMemoryCivic({ now: () => timestamp })

    const first = civic.record(post, flooding)
    const second = civic.record(post, flooding)

    expect(first).toMatchObject({
      post_id: 'post-1',
      community_id: 'kw:victoria-park',
      type: 'flooding',
      status: 'reported',
      location_hint: 'Near the playground',
    })
    expect(second).toEqual(first)
    expect(civic.list()).toHaveLength(1)
  })

  it('never creates an incident for a hidden post or a non-incident analysis', () => {
    const civic = createInMemoryCivic({ now: () => timestamp })

    expect(civic.record({ ...post, hidden: true }, flooding)).toBeNull()
    expect(civic.record(post, {
      incident: { type: 'none', severity: 0, location_hint: null, evidence: 'none' },
    })).toBeNull()
    expect(civic.list()).toEqual([])
  })

  it('filters, verifies, and removes an incident when its post is hidden', () => {
    const civic = createInMemoryCivic({ now: () => '2026-09-19T13:00:00.000Z' })
    const incident = civic.record(post, flooding)
    if (!incident) throw new Error('Expected a visible incident')

    expect(civic.verify(incident.id, 'Crew dispatched')).toMatchObject({
      status: 'verified',
      staff_note: 'Crew dispatched',
      updated_at: '2026-09-19T13:00:00.000Z',
    })
    expect(civic.list({ status: 'verified' })).toHaveLength(1)
    civic.removeForPost(post.id)
    expect(civic.list()).toEqual([])
  })
})
