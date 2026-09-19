import { describe, expect, it } from 'vitest'
import { containCity, constrainCamera, zoomCamera } from './camera'
describe('fallback gesture camera', () => {
  const bounds = containCity(1000, 500)
  it('starts with white padding around the complete city', () => {
    expect(bounds).toEqual({ x: -120, y: -60, width: 1240, height: 620 })
  })
  it('keeps the pinch anchor at the same viewport fraction', () => {
    const anchor = { x: 400, y: 200 }
    const zoom = zoomCamera(bounds, bounds, 2, anchor)
    expect((anchor.x - zoom.x) / zoom.width).toBeCloseTo((anchor.x - bounds.x) / bounds.width)
    expect((anchor.y - zoom.y) / zoom.height).toBeCloseTo((anchor.y - bounds.y) / bounds.height)
  })
  it('limits zoom to 1–4 and panning to city bounds', () => {
    const zoom = zoomCamera(bounds, bounds, 100, { x: 500, y: 250 })
    expect(zoom.width).toBe(310)
    expect(constrainCamera({ ...zoom, x: 9999, y: -9999 }, bounds)).toEqual({ x: 810, y: -60, width: 310, height: 155 })
    expect(zoomCamera(zoom, bounds, .001, { x: 500, y: 250 })).toEqual(bounds)
  })
  it('round-trips zoom without changing the geographic coordinate under its anchor', () => {
    const anchor = { x: 500, y: 250 }
    expect(zoomCamera(zoomCamera(bounds, bounds, 2, anchor), bounds, .5, anchor)).toEqual(bounds)
  })
})
