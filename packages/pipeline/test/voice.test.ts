import { describe, expect, it, vi } from 'vitest'
import {
  analyzeVoice, degradationFor, foldVoiceIntoText, formatSupported,
  validateVoiceAnalysis, type VoiceAnalysis,
} from '../src/voice'
import { ModelError, type ModelProvider } from '../src/provider/types'

const audio = { mimeType: 'audio/webm;codecs=opus', data: 'AAAA' }

const request = {
  audio, caption: 'Patio is packed', blockName: 'King West', localTime: '2026-09-19T20:10:00-04:00',
  hasPhoto: true,
}

/** A provider that answers with whatever it is handed. */
const fakeProvider = (
  behaviour: { json?: unknown; throws?: ModelError }, available = true,
): ModelProvider => ({
  name: 'fake',
  available: () => available,
  complete: async () => {
    if (behaviour.throws) throw behaviour.throws
    return {
      json: behaviour.json, raw: JSON.stringify(behaviour.json), attempts: 1,
      model: 'fake', provider: 'fake', latencyMs: 12,
    }
  },
})

const good = {
  transcript: 'There is a band playing on the patio',
  audio_cues: ['live music', 'crowd chatter'],
  speech_mood: 'cheerful',
  confidence: 88,
}

describe('validateVoiceAnalysis', () => {
  it('passes a well-formed answer through', () => {
    expect(validateVoiceAnalysis(good)).toEqual(good)
  })

  it('clamps confidence into 0 to 100 and rounds it', () => {
    expect(validateVoiceAnalysis({ ...good, confidence: 140 })?.confidence).toBe(100)
    expect(validateVoiceAnalysis({ ...good, confidence: -5 })?.confidence).toBe(0)
    expect(validateVoiceAnalysis({ ...good, confidence: 61.6 })?.confidence).toBe(62)
  })

  it('defaults a missing confidence to 0 rather than trusting it', () => {
    expect(validateVoiceAnalysis({ ...good, confidence: 'high' })?.confidence).toBe(0)
  })

  it('caps the cue list and drops empty entries', () => {
    const analysis = validateVoiceAnalysis({
      ...good, audio_cues: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(analysis?.audio_cues).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('treats nothing said and nothing heard as silence, not an analysis', () => {
    expect(validateVoiceAnalysis({ ...good, transcript: '', audio_cues: [] })).toBeNull()
  })

  it('keeps cues when there is no speech, because the room is still evidence', () => {
    const analysis = validateVoiceAnalysis({ ...good, transcript: '', audio_cues: ['rain'] })
    expect(analysis?.transcript).toBe('')
    expect(analysis?.audio_cues).toEqual(['rain'])
  })

  it('rejects anything that is not an object', () => {
    expect(validateVoiceAnalysis(null)).toBeNull()
    expect(validateVoiceAnalysis('transcript')).toBeNull()
  })
})

describe('formatSupported', () => {
  it('accepts what the recorder can produce', () => {
    expect(formatSupported('audio/webm;codecs=opus')).toBe(true)
    expect(formatSupported('audio/mp4')).toBe(true)
  })

  it('rejects anything else before spending a call on it', () => {
    expect(formatSupported('audio/amr')).toBe(false)
    expect(formatSupported('video/mp4')).toBe(false)
  })
})

describe('degradationFor', () => {
  it('separates the five rungs, because the operator needs to know which', () => {
    expect(degradationFor(new ModelError('OMNI_API_KEY is not set', 'config', 0))).toBe('disabled')
    expect(degradationFor(new ModelError('402: out of credits', 'refusal', 1))).toBe('credits')
    expect(degradationFor(new ModelError('OMNI did not return JSON', 'parse', 2))).toBe('unintelligible')
    expect(degradationFor(new ModelError('OMNI did not answer within 8000ms', 'transport', 2))).toBe('timeout')
    expect(degradationFor(new ModelError('fetch failed', 'transport', 2))).toBe('unreachable')
  })
})

describe('analyzeVoice never fails a post', () => {
  it('degrades to disabled with no key, without calling anything', async () => {
    const result = await analyzeVoice(request, { provider: fakeProvider({ json: good }, false) })
    expect(result).toMatchObject({ analysis: null, degraded: 'disabled' })
  })

  it('rejects an unsupported container before spending a call', async () => {
    const provider = fakeProvider({ json: good })
    const spy = vi.spyOn(provider, 'complete')
    const result = await analyzeVoice(
      { ...request, audio: { mimeType: 'audio/amr', data: 'AAAA' } }, { provider },
    )
    expect(result.degraded).toBe('unsupported_format')
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns the analysis on the happy path', async () => {
    const result = await analyzeVoice(request, { provider: fakeProvider({ json: good }) })
    expect(result.degraded).toBe('none')
    expect(result.analysis?.transcript).toContain('band playing')
  })

  it('turns a timeout into a rung rather than an exception', async () => {
    const result = await analyzeVoice(request, {
      provider: fakeProvider({ throws: new ModelError('OMNI did not answer within 8000ms', 'transport', 2) }),
    })
    expect(result).toMatchObject({ analysis: null, degraded: 'timeout' })
  })

  it('turns exhausted credits into a rung', async () => {
    const result = await analyzeVoice(request, {
      provider: fakeProvider({ throws: new ModelError('402: quota', 'refusal', 1) }),
    })
    expect(result).toMatchObject({ analysis: null, degraded: 'credits' })
  })

  it('turns silence into a rung', async () => {
    const result = await analyzeVoice(request, {
      provider: fakeProvider({ json: { ...good, transcript: '', audio_cues: [] } }),
    })
    expect(result).toMatchObject({ analysis: null, degraded: 'unintelligible' })
  })
})

describe('foldVoiceIntoText', () => {
  const analysis = good as VoiceAnalysis

  it('labels the spoken part so Call A can tell it from the caption', () => {
    expect(foldVoiceIntoText('Patio is packed', analysis))
      .toBe('Patio is packed\n[spoken] There is a band playing on the patio')
  })

  it('carries a voice-only post on the transcript alone', () => {
    expect(foldVoiceIntoText('', analysis)).toBe('[spoken] There is a band playing on the patio')
  })

  it('leaves the caption untouched when there is no transcript', () => {
    expect(foldVoiceIntoText('Patio is packed', null)).toBe('Patio is packed')
    expect(foldVoiceIntoText('Patio is packed', { ...analysis, transcript: '' })).toBe('Patio is packed')
  })

  it('never exceeds what PostInput.text allows', () => {
    const long = foldVoiceIntoText('a'.repeat(990), { ...analysis, transcript: 'b'.repeat(600) })
    expect(long.length).toBeLessThanOrEqual(1000)
  })
})
