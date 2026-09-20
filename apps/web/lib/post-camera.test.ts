import { describe, expect, it } from 'vitest'
import { cameraErrorMessage, canUseLiveCamera } from './post-camera'

describe('post camera support', () => {
  it('uses a live camera when getUserMedia is available in a secure context', () => {
    expect(canUseLiveCamera(true, { getUserMedia: () => Promise.resolve({}) })).toBe(true)
    expect(canUseLiveCamera(false, { getUserMedia: () => Promise.resolve({}) })).toBe(false)
    expect(canUseLiveCamera(true, undefined)).toBe(false)
  })

  it('gives an actionable message when camera permission is not available', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toContain('Allow camera access')
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toContain('No camera was found')
    expect(cameraErrorMessage({ name: 'AbortError' })).toContain('could not start')
  })
})
