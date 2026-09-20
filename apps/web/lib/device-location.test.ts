import { describe, expect, it } from 'vitest'
import { locationErrorMessage, locationOptions } from './device-location'

describe('device location guidance', () => {
  it('uses a quick high accuracy request first and a tolerant fallback second', () => {
    expect(locationOptions(false)).toEqual({ timeout: 10000, maximumAge: 60000, enableHighAccuracy: true })
    expect(locationOptions(true)).toEqual({ timeout: 20000, maximumAge: 300000, enableHighAccuracy: false })
  })

  it('explains the recoverable phone permission states', () => {
    expect(locationErrorMessage({ code: 1 })).toContain('Allow location')
    expect(locationErrorMessage({ code: 2 })).toContain('could not find')
    expect(locationErrorMessage({ code: 3 })).toContain('taking too long')
    expect(locationErrorMessage({ code: 0 })).toContain('Choose a community')
  })
})
