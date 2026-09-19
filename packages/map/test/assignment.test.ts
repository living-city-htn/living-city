import { describe, expect, it } from 'vitest'
import { assignCommunity, defaultAssignmentData, type AssignmentData } from '../src/index'
import mappings from '../data/processed/official-area-mapping.json'

const data: AssignmentData = {
  officialAreas: [
    {
      official_area_id: 'official:uptown',
      block_id: 'kw:uptown-waterloo',
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-80.53, 43.46],
          [-80.51, 43.46],
          [-80.51, 43.48],
          [-80.53, 43.48],
          [-80.53, 43.46],
        ]],
      },
    },
    {
      official_area_id: 'official:unmapped',
      block_id: null,
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [-80.50, 43.44],
          [-80.48, 43.44],
          [-80.48, 43.46],
          [-80.50, 43.46],
          [-80.50, 43.44],
        ]],
      },
    },
  ],
  blocks: [
    { community_id: 'kw:uptown-waterloo', centroid: [-80.52, 43.47] },
    { community_id: 'kw:downtown-kitchener', centroid: [-80.49, 43.45] },
  ],
}

describe('assignCommunity', () => {
  it('uses the official-area mapping for a point inside a mapped polygon', () => {
    expect(assignCommunity(-80.52, 43.47, data)).toBe('kw:uptown-waterloo')
  })

  it('uses the nearest drawn block when an official area has no drawn-block mapping', () => {
    expect(assignCommunity(-80.49, 43.45, data)).toBe('kw:downtown-kitchener')
  })

  it('uses the nearest drawn block when the point is outside every official polygon', () => {
    expect(assignCommunity(-80.485, 43.451, data)).toBe('kw:downtown-kitchener')
  })

  it('loads the checked-in official areas and mapping for the two-argument contract', () => {
    expect(defaultAssignmentData.officialAreas.some(
      (candidate) => candidate.official_area_id === 'kitchener:1' && candidate.block_id === 'kw:downtown-kitchener',
    )).toBe(true)
    expect(assignCommunity(-80.491, 43.451)).toBe('kw:downtown-kitchener')
  })

  it('uses the default nearest block fallback for an unmapped official area', () => {
    const area = defaultAssignmentData.officialAreas.find(
      (candidate) => candidate.official_area_id === 'kitchener:20',
    )
    const point = area?.polygon.coordinates[0]?.[0]
    if (!area || !point) throw new Error('Victoria Hills must be present in the raw assignment data')

    expect(assignCommunity(point[0], point[1])).toBe(
      assignCommunity(point[0], point[1], {
        officialAreas: [],
        blocks: defaultAssignmentData.blocks,
      }),
    )
  })

  it('keeps every mapping entry attached to a checked-in official area', () => {
    expect(mappings.official_area_mappings.every((mapping) =>
      defaultAssignmentData.officialAreas.some((area) =>
        area.official_area_id === mapping.official_area_id && area.block_id === mapping.community_id,
      ),
    )).toBe(true)
  })
})
