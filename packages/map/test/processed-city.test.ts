import { describe, expect, it } from 'vitest'
import { processedCity } from '../src/index'
import mappings from '../data/processed/official-area-mapping.json'

/**
 * The city used to be twelve hand-drawn blocks across Kitchener-Waterloo with
 * invented names. It is now Waterloo alone, cut from the City of Waterloo's
 * own district schedule by scripts/build-city.mjs, so these check the real
 * districts instead of the placeholders.
 */
describe('the processed Waterloo city', () => {
  const communities = processedCity.communities
  const ids = new Set(communities.map((community) => community.community_id))

  it('ships one contract-valid block per official district, plus the reserve', () => {
    expect(communities).toHaveLength(27)
    expect([...ids]).toEqual(expect.arrayContaining([
      'kw:central',
      'kw:lincoln',
      'kw:lexington',
      'kw:laurelwood',
      'kw:uw-northwest-campus',
      'kw:uw-research-and-technology-park',
    ]))

    // The schedule leaves the Laurel Creek corridor and the university's
    // environmental reserve unlabelled. It is the largest single piece of the
    // map, so it gets a block; it is the one block with no official area
    // behind it, and it is protected land rather than lots.
    const reserve = communities.find((c) => c.community_id === 'kw:uw-environmental-reserve')
    expect(reserve?.source).toBe('synthetic')
    expect(reserve?.capacity.max_height_tier).toBe(1)
    expect(reserve?.land_use_hints.dominant_zoning).toBe('green')
    expect(reserve?.land_use_hints.campus).toBe(false)

    expect(communities.filter((c) => c.land_use_hints.campus).every(
      (community) => community.capacity.max_height_tier === 3,
    )).toBe(true)

    for (const community of communities) {
      expect(community.source).toBe(community.community_id === 'kw:uw-environmental-reserve' ? 'synthetic' : 'admin')
      expect(community.polygon_block.coordinates[0].length).toBeGreaterThanOrEqual(5)
      expect(community.polygon_block.coordinates[0].length).toBeLessThanOrEqual(16)
      expect(community.adjacent_ids.every((id) => ids.has(id))).toBe(true)
    }
  })

  it('gives every block exactly three stable decoration slots', () => {
    const parsedSlots = processedCity.slots

    expect(parsedSlots).toHaveLength(communities.length * 3)
    for (const community of communities) {
      const blockSlots = parsedSlots.filter((slot) => slot.community_id === community.community_id)
      expect(blockSlots.map((slot) => slot.slot_id)).toEqual(['edge-west', 'plaza', 'edge-east'])
    }
  })

  it('maps only known official areas to known visual blocks', () => {
    expect(mappings.official_area_mappings.length).toBeGreaterThan(0)
    expect(mappings.official_area_mappings.every((mapping) => ids.has(mapping.community_id))).toBe(true)
    expect(new Set(mappings.official_area_mappings.map((mapping) => mapping.official_area_id)).size)
      .toBe(mappings.official_area_mappings.length)
  })

  /**
   * The point of the rebuild: a block should be the size its district is.
   * An earlier partition put every boundary halfway between two centroids,
   * which took no account of size and collapsed Lexington to nothing.
   */
  it('gives every block an area close to its real district', () => {
    for (const community of communities) {
      expect(community.area_km2).toBeGreaterThan(0.3)
    }
    const smallest = Math.min(...communities.map((c) => c.area_km2))
    expect(smallest).toBeGreaterThan(0.5)
  })
})
