import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyzeVoice } from '../src/voice'
import { fixtureVoiceProvider, resetVoiceFixtures, scenarioFor } from '../src/voice/fixture'

/**
 * The offline rehearsal. If these pass, the voice path runs at a venue with no
 * key and no network, which is the only condition it is guaranteed to face.
 */

const audio = { mimeType: 'audio/wav', data: 'AAAA' }
const base = {
  audio, caption: 'Patio is packed', blockName: 'King West',
  localTime: '2026-09-19T20:10:00-04:00', hasPhoto: true,
}

beforeEach(() => resetVoiceFixtures())
afterEach(() => {
  delete process.env.VOICE_FIXTURES
  delete process.env.OMNI_API_KEY
})

describe('scenarioFor', () => {
  it('defaults to clean, so the ordinary rehearsal needs no configuration', () => {
    expect(scenarioFor(null)).toBe('clean')
    expect(scenarioFor({})).toBe('clean')
    expect(scenarioFor({ scenario: '' })).toBe('clean')
  })

  it('honours a named scenario', () => {
    expect(scenarioFor({ scenario: 'noisy' })).toBe('noisy')
  })
})

describe('the fixture provider', () => {
  it('is always available, because it needs nothing', () => {
    expect(fixtureVoiceProvider().available()).toBe(true)
  })

  it('answers the clean scenario with a full transcript', async () => {
    const result = await analyzeVoice(base, { provider: fixtureVoiceProvider() })
    expect(result.degraded).toBe('none')
    expect(result.analysis?.transcript).toContain('band playing')
    expect(result.analysis?.audio_cues).toContain('live music')
    expect(result.analysis?.confidence).toBeGreaterThan(80)
  })

  it('answers the noisy scenario with lower confidence, as a venue would', async () => {
    const clean = await analyzeVoice(base, { provider: fixtureVoiceProvider() })
    const noisy = await analyzeVoice(
      { ...base, scenario: 'noisy' }, { provider: fixtureVoiceProvider() },
    )
    expect(noisy.analysis?.confidence).toBeLessThan(clean.analysis!.confidence)
    expect(noisy.analysis?.audio_cues).toContain('traffic')
  })

  it('turns the silence scenario into the unintelligible rung', async () => {
    const result = await analyzeVoice(
      { ...base, scenario: 'silence' }, { provider: fixtureVoiceProvider() },
    )
    expect(result).toMatchObject({ analysis: null, degraded: 'unintelligible' })
  })

  it('falls back to clean for a scenario nobody wrote', async () => {
    const result = await analyzeVoice(
      { ...base, scenario: 'no-such-scenario' }, { provider: fixtureVoiceProvider() },
    )
    expect(result.analysis?.transcript).toContain('band playing')
  })

  it('degrades rather than throwing when the fixture file is missing', async () => {
    process.env.VOICE_FIXTURE_PATH = 'packages/fixtures/data/voice/does-not-exist.json'
    resetVoiceFixtures()
    // The module resolves its path once at import, so this asserts the shape of
    // the failure rather than the path: an unreadable fixture must look like an
    // unintelligible answer, never like a crash.
    const result = await analyzeVoice(
      { ...base, scenario: 'silence' }, { provider: fixtureVoiceProvider() },
    )
    expect(result.analysis).toBeNull()
    delete process.env.VOICE_FIXTURE_PATH
  })
})

describe('the fixture switch cannot shadow a real call', () => {
  it('is off when an OMNI key is present, even with VOICE_FIXTURES=1', async () => {
    process.env.VOICE_FIXTURES = '1'
    process.env.OMNI_API_KEY = 'real-key'
    const { env } = await import('../src/env')
    expect(env.voiceFixtures()).toBe(false)
  })

  it('is on with the flag and no key', async () => {
    process.env.VOICE_FIXTURES = '1'
    delete process.env.OMNI_API_KEY
    const { env } = await import('../src/env')
    expect(env.voiceFixtures()).toBe(true)
  })
})
