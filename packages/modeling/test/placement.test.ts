import { describe, expect, it } from 'vitest'
import { inside, placeBlock, toLocalMetres, type PlacementInput } from '../src/placement'

/** A 600m-ish square block, which is the scale of a real drawn block. */
const square: Array<[number, number]> = [
  [-80.52, 43.46], [-80.513, 43.46], [-80.513, 43.465], [-80.52, 43.465], [-80.52, 43.46],
]

const base: PlacementInput = {
  communityId: 'kw:test', ring: square, centroid: [-80.5165, 43.4625],
  lotCount: 24, maxHeightTier: 4, density: 3,
  composition: { residential: 50, retail: 20, cafe_bar: 10, office: 10, cultural_civic: 5, campus_industrial: 5 },
  heightProfile: 'low_mid', vegetationLevel: 3, crowdClusters: 2,
}

describe('placeBlock', () => {
  it('is deterministic: the same plan and seed give the same block', () => {
    expect(placeBlock(base)).toEqual(placeBlock(base))
  })

  it('gives a different block to a different community', () => {
    const other = placeBlock({ ...base, communityId: 'kw:other' })
    expect(other).not.toEqual(placeBlock(base))
  })

  it('keeps every cell inside the polygon', () => {
    const local = square.map((p) => toLocalMetres(p, base.centroid))
    for (const cell of placeBlock(base)) expect(inside(cell.x, cell.y, local)).toBe(true)
  })

  it('never exceeds the block height tier', () => {
    const tall = placeBlock({ ...base, heightProfile: 'high', maxHeightTier: 2 })
    for (const cell of tall) if (cell.storeys) expect(cell.storeys).toBeLessThanOrEqual(6)
  })

  it('builds more at higher density', () => {
    const count = (d: number) =>
      placeBlock({ ...base, density: d }).filter((c) => c.kind === 'building').length
    expect(count(5)).toBeGreaterThan(count(1))
  })

  it('puts one plaza at the centre when the plan asks for crowds', () => {
    const plazas = placeBlock(base).filter((c) => c.kind === 'plaza')
    expect(plazas).toHaveLength(1)
    const others = placeBlock(base).filter((c) => c.kind !== 'plaza')
    for (const o of others) {
      expect(Math.hypot(plazas[0]!.x, plazas[0]!.y)).toBeLessThanOrEqual(Math.hypot(o.x, o.y) + 0.001)
    }
  })

  it('places no plaza when the plan has no crowds', () => {
    expect(placeBlock({ ...base, crowdClusters: 0 }).some((c) => c.kind === 'plaza')).toBe(false)
  })

  it('only uses categories the composition actually contains', () => {
    const only = placeBlock({ ...base, composition: { residential: 100 } })
    for (const c of only) if (c.category) expect(c.category).toBe('residential')
  })

  it('survives a degenerate ring rather than throwing', () => {
    expect(placeBlock({ ...base, ring: [[0, 0], [0, 0], [0, 0]] })).toEqual([])
  })
})
