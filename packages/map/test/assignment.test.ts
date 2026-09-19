import { describe, expect, it } from 'vitest'
import { assignCommunity, type AssignmentData } from '../src/index'

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
})
