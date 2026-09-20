import { describe, expect, it } from 'vitest'
import {
  AUDIO_MIME_CANDIDATES, MAX_AUDIO_BYTES, checkRecording, extensionFor,
  formatDuration, pickMimeType, recorderMessage, secondsRemaining,
} from './post-audio'

/** A browser that supports exactly the listed types and nothing else. */
const supporting = (...types: string[]) => (type: string) => types.includes(type)

describe('pickMimeType', () => {
  it('gives Android Chrome opus in webm', () => {
    expect(pickMimeType(supporting('audio/webm;codecs=opus', 'audio/webm')))
      .toBe('audio/webm;codecs=opus')
  })

  it('gives iOS Safari audio/mp4, because it supports no webm variant', () => {
    expect(pickMimeType(supporting('audio/mp4'))).toBe('audio/mp4')
  })

  it('returns null when MediaRecorder exists but writes nothing we can send', () => {
    expect(pickMimeType(supporting())).toBeNull()
  })

  it('returns null when isTypeSupported is missing entirely', () => {
    expect(pickMimeType(undefined)).toBeNull()
  })

  it('survives an implementation that throws instead of returning false', () => {
    expect(pickMimeType((type) => {
      if (type !== 'audio/mp4') throw new TypeError('nope')
      return true
    })).toBe('audio/mp4')
  })

  it('only ever returns a candidate it was asked about', () => {
    const picked = pickMimeType(supporting(...AUDIO_MIME_CANDIDATES))
    expect(AUDIO_MIME_CANDIDATES).toContain(picked)
  })
})

describe('extensionFor', () => {
  it('names the container, not the codec', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionFor('audio/mp4')).toBe('m4a')
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg')
  })

  it('falls back to webm for anything unexpected', () => {
    expect(extensionFor('audio/flac')).toBe('webm')
  })
})

describe('the countdown', () => {
  it('starts at 30 and floors at zero', () => {
    expect(secondsRemaining(0)).toBe(30)
    expect(secondsRemaining(29_400)).toBe(1)
    expect(secondsRemaining(30_000)).toBe(0)
    expect(secondsRemaining(45_000)).toBe(0)
  })

  it('formats as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7_400)).toBe('0:07')
    expect(formatDuration(30_000)).toBe('0:30')
  })
})

describe('checkRecording', () => {
  const clip = (size: number, durationMs: number) => ({
    blob: new Blob([new Uint8Array(size)], { type: 'audio/webm' }),
    durationMs,
  })

  it('accepts an ordinary clip', () => {
    expect(checkRecording(clip(20_000, 6_000))).toEqual({ ok: true })
  })

  it('rejects a mis-tap', () => {
    expect(checkRecording(clip(400, 300))).toEqual({ ok: false, reason: 'too_short' })
  })

  it('rejects an empty recording', () => {
    expect(checkRecording(clip(0, 5_000))).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects anything over the byte cap', () => {
    expect(checkRecording(clip(MAX_AUDIO_BYTES + 1, 10_000)))
      .toEqual({ ok: false, reason: 'too_large' })
  })
})

describe('recorderMessage', () => {
  it('tells someone who declined that they can still post', () => {
    expect(recorderMessage('denied')).toMatch(/still post/)
    expect(recorderMessage('unavailable')).toMatch(/still post/)
  })

  it('says nothing at all when idle', () => {
    expect(recorderMessage('idle')).toBe('')
  })
})
