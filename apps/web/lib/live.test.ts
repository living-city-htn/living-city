import { describe, expect, it } from 'vitest'
import { changedPlanIds, isCityVersion, mergePlans, planIdsOf } from './live'
import type { CommunityPlan } from '@living-city/fixtures'

const plan = (communityId: string, planId: string) =>
  ({ community_id: communityId, plan_id: planId, summary: planId }) as CommunityPlan

describe('changedPlanIds', () => {
  const version = { plans: { 'kw:a': 'a:2', 'kw:b': 'b:1' }, updated_at: 'now' }

  it('reports a block whose plan id moved', () => {
    expect(changedPlanIds(version, { 'kw:a': 'a:1', 'kw:b': 'b:1' })).toEqual(['kw:a'])
  })

  it('reports a block we have never seen', () => {
    expect(changedPlanIds(version, { 'kw:a': 'a:2' })).toEqual(['kw:b'])
  })

  it('reports nothing when everything matches, so the scene never rebuilds for free', () => {
    expect(changedPlanIds(version, { 'kw:a': 'a:2', 'kw:b': 'b:1' })).toEqual([])
  })

  it('leaves a block absent from the response alone rather than blanking it', () => {
    const partial = { plans: { 'kw:a': 'a:1' }, updated_at: 'now' }
    expect(changedPlanIds(partial, { 'kw:a': 'a:1', 'kw:b': 'b:1' })).toEqual([])
  })
})

describe('mergePlans', () => {
  it('replaces only the plans that were re-fetched', () => {
    const current = [plan('kw:a', 'a:1'), plan('kw:b', 'b:1')]
    const merged = mergePlans(current, [plan('kw:a', 'a:2')])
    expect(planIdsOf(merged)).toEqual({ 'kw:a': 'a:2', 'kw:b': 'b:1' })
  })

  it('returns the same array when nothing changed', () => {
    const current = [plan('kw:a', 'a:1')]
    expect(mergePlans(current, [])).toBe(current)
  })

  it('appends a block that was not there before', () => {
    const merged = mergePlans([plan('kw:a', 'a:1')], [plan('kw:c', 'c:1')])
    expect(merged).toHaveLength(2)
  })
})

describe('isCityVersion', () => {
  it('accepts the documented shape', () => {
    expect(isCityVersion({ plans: { 'kw:a': 'a:1' }, updated_at: 'now' })).toBe(true)
  })

  it('rejects a plan id that is not a string, so a bad poll cannot blank the city', () => {
    expect(isCityVersion({ plans: { 'kw:a': 3 }, updated_at: 'now' })).toBe(false)
    expect(isCityVersion(null)).toBe(false)
  })
})
