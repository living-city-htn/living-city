import { describe, expect, it } from 'vitest'
import { nearestCommunity } from './post-location'
const communities = [
  { community_id: 'uptown', name: 'Uptown Waterloo', centroid: [-80.52, 43.46] },
  { community_id: 'university', name: 'University District', centroid: [-80.54, 43.47] },
]
describe('location confirmation', () => {
  it('resolves GPS coordinates to the community shown before posting', () => {
    expect(nearestCommunity(communities, -80.541, 43.471)).toEqual(communities[1])
  })
  it('uses the nearest demo block for locations outside the drawn city', () => {
    expect(nearestCommunity(communities, -80.50, 43.44)?.community_id).toBe('uptown')
  })
  it('returns no match for missing community data or invalid coordinates', () => {
    expect(nearestCommunity([], -80.54, 43.47)).toBeNull()
    expect(nearestCommunity(communities, NaN, 43.47)).toBeNull()
    expect(nearestCommunity(communities, -80.54, 100)).toBeNull()
    expect(nearestCommunity([{ community_id: 'missing', name: 'Missing geometry', centroid: [] }], -80.54, 43.47)).toBeNull()
  })
})
