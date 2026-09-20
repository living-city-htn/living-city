import { describe, expect, it } from 'vitest'
import {
  DEVICE_COOKIE,
  DEVICE_HEADER,
  currentUser,
  deviceIdFromRequest,
  resetIdentityForTests,
  userForDevice,
} from './identity'

describe('device identity', () => {
  it('prefers the middleware header and falls back to the cookie', () => {
    const request = new Request('https://living-city.test/api/me', {
      headers: {
        cookie: `${DEVICE_COOKIE}=cookie-device`,
        [DEVICE_HEADER]: 'header-device-1234',
      },
    })

    expect(deviceIdFromRequest(request)).toBe('header-device-1234')
    expect(currentUser(request).id).toBe('device:header-device-1234')
  })

  it('creates a stable resident user per device without sharing identities', () => {
    resetIdentityForTests()

    const first = userForDevice('device-a')
    const again = userForDevice('device-a')
    const second = userForDevice('device-b')

    expect(again).toEqual(first)
    expect(second.id).not.toBe(first.id)
    expect(first.role).toBe('resident')
  })

  it('maps only the configured device to the seeded government account', () => {
    resetIdentityForTests('government-device')

    expect(userForDevice('government-device')).toMatchObject({
      id: 'u-gov',
      role: 'government',
    })
    expect(userForDevice('another-device').role).toBe('resident')
  })
})
