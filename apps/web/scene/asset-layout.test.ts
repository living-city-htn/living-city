import { describe, expect, it } from 'vitest'
import { buildingAsset, waterCell, decorationAsset, vegetationAsset, plazaDecorations } from './asset-layout'
import type { Cell } from '@living-city/modeling'
const cell: Cell = { x: 0, y: 0, size: 10, kind: 'building', category: 'residential', storeys: 2, variant: 0.7 }
const ring: Array<[number, number]> = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
describe('city asset assignment', () => {
  it('distinguishes apartments, offices and low-rise homes deterministically', () => {
    expect(buildingAsset(cell)).toBe('house-03')
    expect(buildingAsset({ ...cell, storeys: 6 })).toBe('apartment-02')
    expect(buildingAsset({ ...cell, category: 'office', storeys: 6 })).toBe('office-02')
    expect(buildingAsset({ ...cell, category: 'campus_industrial' }, true)).toBe('campus-01')
  })
  it('only reserves fitted water terrain where geography permits, clear of placement slots', () => {
    expect(waterCell([cell], ring, false, [])).toBe(-1)
    expect(waterCell([cell], ring, true, [])).toBe(0)
    expect(waterCell([cell], ring, true, [[0, 0]])).toBe(-1)
    expect(waterCell([{ ...cell, x: 9 }], ring, true, [])).toBe(-1)
    expect(waterCell([{ ...cell, kind: 'plaza' }], ring, true, [])).toBe(-1)
  })
})

it('keeps all shop products distinct and honors vegetation and multiple event props', () => {
  const tags = ['benches', 'planters', 'string_lights', 'food_trucks', 'fountain', 'sculpture']
  expect(new Set(tags.map((tag) => decorationAsset[tag])).size).toBe(6)
  expect(tags.every((tag) => decorationAsset[tag])).toBe(true)
  expect(vegetationAsset(['flower_beds'], 0.5)).toBe('flowers-01')
  expect(vegetationAsset(['hedges'], 0.5)).toBe('shrub-01')
  expect(plazaDecorations(['string_lights', 'stage']).map((entry) => entry.tag)).toEqual(['string_lights', 'stage'])
})
