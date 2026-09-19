import { describe, expect, it } from 'vitest'
import { communityGeo, decorationSlot } from '@living-city/contracts'
import city from '../data/processed/city.json'
import slots from '../data/processed/slots.json'
import mappings from '../data/processed/official-area-mapping.json'

describe('the processed Kitchener-Waterloo city', () => {
  it('ships 12 to 20 contract-valid hand-drawn blocks with the demo landmarks', () => {
    const communities = communityGeo.array().parse(city.communities)
    const ids = new Set(communities.map((community) => community.community_id))

    expect(communities).toHaveLength(12)
    expect([...ids]).toEqual(expect.arrayContaining([
      'kw:uptown-waterloo',
      'kw:university-district',
      'kw:laurier-campus',
      'kw:victoria-park',
      'kw:downtown-kitchener',
      'kw:midtown-ion',
    ]))
    expect(communities.find((community) => community.community_id === 'kw:uptown-waterloo')?.capacity.max_height_tier).toBe(4)
    expect(communities.find((community) => community.community_id === 'kw:downtown-kitchener')?.capacity.max_height_tier).toBe(4)
    expect(communities.filter((community) => community.land_use_hints.campus).every(
      (community) => community.capacity.max_height_tier === 3,
    )).toBe(true)

    for (const community of communities) {
      expect(community.source).toBe('synthetic')
      expect(community.polygon_block.coordinates[0].length).toBeGreaterThanOrEqual(5)
      expect(community.polygon_block.coordinates[0].length).toBeLessThanOrEqual(9)
      expect(community.adjacent_ids.every((id) => ids.has(id))).toBe(true)
    }
  })

  it('gives every block exactly three stable decoration slots', () => {
    const communities = communityGeo.array().parse(city.communities)
    const parsedSlots = decorationSlot.array().parse(slots)

    expect(parsedSlots).toHaveLength(36)
    for (const community of communities) {
      const blockSlots = parsedSlots.filter((slot) => slot.community_id === community.community_id)
      expect(blockSlots.map((slot) => slot.slot_id)).toEqual(['edge-west', 'plaza', 'edge-east'])
    }
  })

  it('maps only known official areas to known visual blocks', () => {
    const ids = new Set(city.communities.map((community) => community.community_id))
    expect(mappings.official_area_mappings.length).toBeGreaterThan(0)
    expect(mappings.official_area_mappings.every((mapping) => ids.has(mapping.community_id))).toBe(true)
    expect(new Set(mappings.official_area_mappings.map((mapping) => mapping.official_area_id)).size)
      .toBe(mappings.official_area_mappings.length)
  })
})
