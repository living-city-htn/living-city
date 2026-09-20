import { describe, expect, it } from 'vitest'
import {
  UNVERIFIED_BELOW, corroborationWeight, gateText, isUnverified, labelFor,
  readHumanProbability, scoreText, type Authenticity,
} from './authenticity'

const score = (human: number): Authenticity => ({
  human, label: labelFor(human), chars: 120,
})

describe('gateText', () => {
  it('joins caption and transcript, because a synthetic script is the interesting case', () => {
    expect(gateText('Patio is packed', 'there is a band playing'))
      .toBe('Patio is packed\nthere is a band playing')
  })

  it('works with either half missing', () => {
    expect(gateText('Patio is packed', null)).toBe('Patio is packed')
    expect(gateText('', 'there is a band playing')).toBe('there is a band playing')
  })

  it('never carries an image, because there is nowhere for one to go', () => {
    // The signature only accepts text. This test exists to fail loudly if
    // someone widens it.
    expect(gateText.length).toBe(2)
  })
})

describe('corroborationWeight', () => {
  it('weighs a post with no score exactly 1, so no opinion is not a penalty', () => {
    expect(corroborationWeight(null)).toBe(1)
  })

  it('never exceeds 1, so the gate can only decline to amplify', () => {
    expect(corroborationWeight(score(1))).toBe(1)
    expect(corroborationWeight(score(0.99))).toBeLessThanOrEqual(1)
  })

  it('floors at 0.5, so a synthetic verdict halves rather than erases', () => {
    expect(corroborationWeight(score(0))).toBe(0.5)
    expect(corroborationWeight(score(0.05))).toBeGreaterThanOrEqual(0.5)
  })

  it('rises with confidence, monotonically', () => {
    const weights = [0, 0.25, 0.5, 0.75, 1].map((h) => corroborationWeight(score(h)))
    expect(weights).toEqual([...weights].sort((a, b) => a - b))
  })

  it('clamps a score outside 0 to 1 rather than trusting it', () => {
    expect(corroborationWeight(score(5))).toBe(1)
    expect(corroborationWeight(score(-5))).toBe(0.5)
  })
})

describe('the unverified label', () => {
  it('is advisory: it marks a row and nothing else', () => {
    expect(isUnverified(score(0.2))).toBe(true)
    expect(isUnverified(score(0.9))).toBe(false)
  })

  it('never fires on a post the gate had no opinion about', () => {
    expect(isUnverified(null)).toBe(false)
  })

  it('sits at the documented threshold', () => {
    expect(isUnverified(score(UNVERIFIED_BELOW))).toBe(false)
    expect(isUnverified(score(UNVERIFIED_BELOW - 0.01))).toBe(true)
  })
})

describe('labelFor', () => {
  it('reads the way a person would say it', () => {
    expect(labelFor(0.95)).toBe('likely human')
    expect(labelFor(0.5)).toBe('uncertain')
    expect(labelFor(0.1)).toBe('likely synthetic')
  })
})

describe('readHumanProbability', () => {
  it('reads the direct human probability', () => {
    expect(readHumanProbability({ documents: [{ class_probabilities: { human: 0.82 } }] }))
      .toBeCloseTo(0.82)
  })

  it('falls back to inverting the generated probability', () => {
    expect(readHumanProbability({ documents: [{ completely_generated_prob: 0.9 }] }))
      .toBeCloseTo(0.1)
  })

  it('returns null rather than a guess when the shape is unfamiliar', () => {
    // The safe failure: a vendor change must not turn every post synthetic.
    expect(readHumanProbability(null)).toBeNull()
    expect(readHumanProbability({})).toBeNull()
    expect(readHumanProbability({ documents: [] })).toBeNull()
    expect(readHumanProbability({ documents: [{ class_probabilities: {} }] })).toBeNull()
  })

  it('clamps a value outside 0 to 1', () => {
    expect(readHumanProbability({ documents: [{ class_probabilities: { human: 1.4 } }] })).toBe(1)
  })
})

describe('scoreText never throws', () => {
  it('returns null with no key configured', async () => {
    delete process.env.GPTZERO_API_KEY
    expect(await scoreText('a'.repeat(200))).toBeNull()
  })

  it('returns null for text too short to judge', async () => {
    process.env.GPTZERO_API_KEY = 'test-key'
    expect(await scoreText('too short')).toBeNull()
    delete process.env.GPTZERO_API_KEY
  })
})
