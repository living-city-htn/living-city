import { describe, expect, it } from 'vitest'
import { communityPlan } from '@living-city/contracts'
import { eventCommunityFor, eventPlan } from '../src/city-events'
import { VENUE_COMMUNITY_ID, fallbackPlans } from '../src/index'

const VENUE = VENUE_COMMUNITY_ID
const campus = fallbackPlans.find((p) => p.community_id === VENUE)!

describe('which block a post lights up', () => {
  it('sends anything about Hack the North to the venue, wherever it was posted', () => {
    for (const text of ['Hack the North is packed', 'hackthenorth day two', 'HTN opening ceremony']) {
      expect(eventCommunityFor({ text, community_id: 'kw:laurelwood' }, VENUE)).toBe(VENUE)
    }
  })

  it('keeps any other live event on its own block', () => {
    expect(eventCommunityFor({ text: 'Street festival on King tonight', community_id: 'kw:central' }, VENUE))
      .toBe('kw:central')
  })

  it('leaves ordinary posts alone, which is almost all of them', () => {
    for (const text of ['Good coffee at the corner place', 'Bus was late again', '']) {
      expect(eventCommunityFor({ text, community_id: 'kw:central' }, VENUE)).toBeNull()
    }
  })
})

describe('the plan an event writes', () => {
  const next = eventPlan(campus, `${VENUE}:event:1`)

  it('passes the real Call B contract, so the scene can read it unchanged', () => {
    expect(communityPlan.safeParse(next).success).toBe(true)
  })

  it('changes the mood and the look', () => {
    expect(next.mood).toBe('festive')
    expect(next.effects).toContain('music_notes')
    expect(next.lighting.signature_time).toBe('night')
    expect(next.activity.crowd_clusters).toBeGreaterThan(0)
    expect(next.decorations.map((d) => d.tag)).toContain('string_lights')
  })

  it('keeps the identity, which is the whole claim of moment 4', () => {
    expect(next.archetype).toBe(campus.archetype)
    expect(next.density).toBe(campus.density)
    expect(next.height_profile).toBe(campus.height_profile)
    expect(next.building_composition).toEqual(campus.building_composition)
    expect(next.vegetation).toEqual(campus.vegetation)
  })

  it('moves the plan id, or the version poll never fires', () => {
    expect(next.plan_id).not.toBe(campus.plan_id)
  })
})
