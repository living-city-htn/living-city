import { describe, expect, it } from 'vitest'
import {
  MAX_PINS_PER_BLOCK, blockEffects, budget, groupByCommunity, mix, pinLayout, sceneLighting,
  weatherParticleCount, type SceneIncident, type SceneWeather,
} from './overlays'

const inc = (id: string, status: SceneIncident['status'], community_id = 'a'): SceneIncident =>
  ({ id, community_id, type: 'flooding', status })

const rain: SceneWeather = { effect: 'rain', intensity: 1, is_day: true, sky: ['#8e9bab', '#d5dbe2'], condition: 'rain' }

describe('pins', () => {
  it('puts verified first and centres the row', () => {
    const { pins, overflow } = pinLayout([inc('2', 'reported'), inc('1', 'verified')], 1)
    expect(pins.map((p) => p.id)).toEqual(['1', '2'])
    expect(pins[0]!.x).toBeCloseTo(-pins[1]!.x)
    expect(overflow).toBe(0)
  })
  it('collapses past the cap into a count', () => {
    const many = Array.from({ length: 5 }, (_, i) => inc(String(i), 'reported'))
    const { pins, overflow } = pinLayout(many, 1)
    expect(pins).toHaveLength(MAX_PINS_PER_BLOCK)
    expect(overflow).toBe(2)
  })
  it('groups by community', () => {
    const g = groupByCommunity([inc('1', 'reported', 'a'), inc('2', 'reported', 'b'), inc('3', 'verified', 'a')])
    expect(g.get('a')?.map((i) => i.id)).toEqual(['1', '3'])
  })
})

describe('weather', () => {
  it('draws nothing without an effect and less under reduced detail', () => {
    expect(weatherParticleCount(null, false)).toBe(0)
    expect(weatherParticleCount({ ...rain, effect: null }, false)).toBe(0)
    const full = weatherParticleCount(rain, false)
    expect(full).toBeGreaterThan(0)
    expect(weatherParticleCount(rain, true)).toBeLessThan(full)
  })
  it('dims the light for rain and more for night', () => {
    const clear = sceneLighting(null)
    const wet = sceneLighting(rain)
    const wetNight = sceneLighting({ ...rain, is_day: false })
    expect(wet.sun).toBeLessThan(clear.sun)
    expect(wetNight.sun).toBeLessThan(wet.sun)
    expect(wetNight.ambient).toBeGreaterThan(0)
  })
  it('drops a block’s weather effects only when live weather is known', () => {
    expect(blockEffects(['rain', 'confetti'], rain)).toEqual(['confetti'])
    expect(blockEffects(['rain', 'confetti'], null)).toEqual(['rain', 'confetti'])
    expect(blockEffects(undefined, rain)).toEqual([])
  })
})

describe('helpers', () => {
  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#ffffff', '#000000', 0)).toBe('#ffffff')
  })
  it('halves counts under reduced detail', () => {
    expect(budget(20, false)).toBe(20)
    expect(budget(20, true)).toBe(10)
  })
})
