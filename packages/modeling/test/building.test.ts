import { describe, expect, it } from 'vitest'
import { buildingModel, type BuildingSpecLike } from '../src/building'

const cafe: BuildingSpecLike = {
  name: 'Corner Cafe', kind: 'cafe', height: 'low', storeys: 1, mood: 'cozy',
  identity_tags: ['brick', 'cozy'], features: ['outdoor_seating', 'string_lights'],
}
const tower: BuildingSpecLike = {
  name: 'City Hall', kind: 'office', height: 'high', storeys: 8, mood: 'focused',
  identity_tags: ['historic', 'modern'], features: ['flags', 'fountain', 'benches', 'mural'],
}

const wallHeight = (m: ReturnType<typeof buildingModel>) =>
  m.parts.filter((p) => p.role === 'wall').reduce((s, p) => s + p.size[1], 0)

describe('buildingModel', () => {
  it('is deterministic: the same spec gives the same building', () => {
    expect(buildingModel(tower)).toEqual(buildingModel(tower))
  })

  it('gives a differently named place a different footprint', () => {
    expect(buildingModel({ ...cafe, name: 'Other' })).not.toEqual(buildingModel(cafe))
  })

  it('builds taller for more storeys', () => {
    expect(buildingModel(tower).height).toBeGreaterThan(buildingModel(cafe).height)
    expect(wallHeight(buildingModel({ ...cafe, storeys: 4 }))).toBeGreaterThan(wallHeight(buildingModel(cafe)))
  })

  it('draws one window strip per storey', () => {
    const windows = (m: ReturnType<typeof buildingModel>) => m.parts.filter((p) => p.role === 'window').length
    expect(windows(buildingModel(cafe))).toBe(1)
    expect(windows(buildingModel(tower))).toBe(8)
  })

  it('sets a tall place back as it rises', () => {
    const widths = buildingModel(tower).parts.filter((p) => p.role === 'wall').map((p) => p.size[0])
    expect(widths.length).toBe(3)
    expect(widths[2]).toBeLessThan(widths[0]!)
  })

  it('gives a tall historic place a spire and a cafe an awning', () => {
    expect(buildingModel(tower).parts.some((p) => p.shape === 'spire')).toBe(true)
    expect(buildingModel(cafe).parts.some((p) => p.role === 'accent')).toBe(true)
  })

  it('draws glass walls for a glass place', () => {
    const m = buildingModel({ ...tower, identity_tags: ['glass', 'modern'] })
    expect(m.parts.some((p) => p.role === 'glass')).toBe(true)
    expect(m.parts.some((p) => p.role === 'wall')).toBe(false)
  })

  it('caps props at three and lights a cosy place', () => {
    expect(buildingModel(tower).props).toHaveLength(3)
    expect(buildingModel(cafe).lit).toBe(true)
    expect(buildingModel(tower).lit).toBe(false)
  })

  it('survives an unknown kind and a wild storey count', () => {
    const m = buildingModel({ ...cafe, kind: 'mystery', storeys: 99 })
    expect(m.parts.filter((p) => p.role === 'window')).toHaveLength(8)
  })
})
