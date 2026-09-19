import { describe, expect, it } from 'vitest'
import { parsePostInput } from './post-input'
const ids = ['kw:university-district']
describe('post input', () => {
  it('rejects blank posts even when a location is selected', () => {
    expect(parsePostInput({ text: '   ', community_id: ids[0] }, ids).ok).toBe(false)
  })
  it('accepts a photo without inventing a caption', () => {
    const result = parsePostInput({ image_url: 'data:image/jpeg;base64,YQ==', community_id: ids[0] }, ids)
    expect(result.ok && result.value.text).toBe('')
  })
  it('rejects unknown communities and invalid coordinates', () => {
    expect(parsePostInput({ text: 'Music tonight', community_id: 'unknown' }, ids).ok).toBe(false)
    expect(parsePostInput({ text: 'Music tonight', lon: NaN, lat: 43 }, ids).ok).toBe(false)
    expect(parsePostInput({ text: 'Music tonight', lon: -80, lat: 100 }, ids).ok).toBe(false)
  })
  it('rejects missing location, overlong captions and unsafe image schemes', () => {
    expect(parsePostInput({ text: 'Hello' }, ids).ok).toBe(false)
    expect(parsePostInput({ text: 'a'.repeat(1001), community_id: ids[0] }, ids).ok).toBe(false)
    expect(parsePostInput({ text: 'Hello', image_url: 'javascript:alert(1)', community_id: ids[0] }, ids).ok).toBe(false)
  })
  it('keeps coordinates for server assignment and trims text', () => {
    const result = parsePostInput({ text: ' Hello ', lon: -80.54, lat: 43.47 }, ids)
    expect(result.ok && result.value).toMatchObject({ text: 'Hello', lon: -80.54, lat: 43.47 })
  })
})
