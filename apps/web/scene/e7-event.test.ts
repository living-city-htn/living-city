import { describe, expect, it } from 'vitest'
import { e7EventLabel, isE7FestivalLive } from './e7-event'

describe('E7 event signal', () => {
  it('shows a festival signal only when the E7 campus plan is festive', () => {
    expect(isE7FestivalLive('kw:uw-northwest-campus', 'festive')).toBe(true)
    expect(isE7FestivalLive('kw:uw-northwest-campus', 'focused')).toBe(false)
    expect(isE7FestivalLive('kw:laurelwood', 'festive')).toBe(false)
  })

  it('names fireworks when the accepted plan includes them', () => {
    expect(e7EventLabel(['music_notes', 'fireworks'])).toBe('E7 · fireworks live')
    expect(e7EventLabel(['music_notes'])).toBe('E7 · festival live')
  })
})
