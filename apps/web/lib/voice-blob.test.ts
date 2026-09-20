import { describe, expect, it } from 'vitest'
import { AUDIO_RETENTION, audioKey, decodeAudioDataUrl, storeAudio } from './voice-blob'

const dataUrl = (mime: string, body = 'aGVsbG8=') => `data:${mime};base64,${body}`

describe('audioKey', () => {
  it('names the post, so a clip is always traceable to what it belongs to', () => {
    expect(audioKey('p-42', 'audio/webm;codecs=opus')).toBe('posts/p-42/voice.webm')
    expect(audioKey('p-42', 'audio/mp4')).toBe('posts/p-42/voice.m4a')
    expect(audioKey('p-42', 'audio/ogg;codecs=opus')).toBe('posts/p-42/voice.ogg')
  })

  it('falls back rather than writing a key with no extension', () => {
    expect(audioKey('p-1', 'audio/weird')).toBe('posts/p-1/voice.webm')
  })
})

describe('decodeAudioDataUrl', () => {
  it('splits mime from bytes', () => {
    const decoded = decodeAudioDataUrl(dataUrl('audio/webm;codecs=opus'))
    expect(decoded?.mimeType).toBe('audio/webm;codecs=opus')
    expect(decoded?.bytes.toString()).toBe('hello')
  })

  it('refuses anything that is not audio', () => {
    expect(decodeAudioDataUrl('data:image/jpeg;base64,aGVsbG8=')).toBeNull()
    expect(decodeAudioDataUrl('https://example.com/a.webm')).toBeNull()
  })

  it('refuses an empty payload', () => {
    expect(decodeAudioDataUrl('data:audio/webm;base64,')).toBeNull()
  })
})

describe('storeAudio without a Blob token', () => {
  it('passes the clip through inline, so voice runs with no keys', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    const stored = await storeAudio('p-7', dataUrl('audio/mp4'))
    expect(stored?.key).toBeNull()
    expect(stored?.url).toBe(dataUrl('audio/mp4'))
    expect(stored?.bytes).toBe(5)
  })

  it('returns null for a clip it cannot read, rather than throwing', async () => {
    expect(await storeAudio('p-7', 'not-a-data-url')).toBeNull()
  })
})

describe('the retention decision', () => {
  it('deletes audio once the transcript exists', () => {
    // Guards the privacy decision in docs/08 section 3 against a silent flip.
    expect(AUDIO_RETENTION).toBe('delete-after-transcript')
  })
})
