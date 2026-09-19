import { describe, expect, it } from 'vitest'
import {
  CORROBORATION_CAP, RECENCY_HALF_LIFE_MIN,
  claimWeight, corroborationFactor, dissentNote, incidentConfidence,
  recencyWeight, resolveConflict, type Claim,
} from '../src/scoring'

/** A fixed "now" so every expectation below is exact rather than approximate. */
const NOW = Date.parse('2026-09-19T12:00:00.000Z')

const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString()

const claim = (over: Partial<Claim> & Pick<Claim, 'post_id' | 'assertion'>): Claim => ({
  user_id: `u-${over.post_id}`,
  created_at: minutesAgo(0),
  authenticity: 80,
  confidence: 80,
  ...over,
})

describe('recencyWeight', () => {
  it('is 1 at age zero and halves every half-life', () => {
    expect(recencyWeight(minutesAgo(0), NOW)).toBeCloseTo(1, 6)
    expect(recencyWeight(minutesAgo(RECENCY_HALF_LIFE_MIN), NOW)).toBeCloseTo(0.5, 6)
    expect(recencyWeight(minutesAgo(RECENCY_HALF_LIFE_MIN * 2), NOW)).toBeCloseTo(0.25, 6)
  })

  it('does not exceed 1 for a timestamp in the future', () => {
    const future = new Date(NOW + 60_000).toISOString()
    expect(recencyWeight(future, NOW)).toBe(1)
  })
})

describe('claimWeight', () => {
  it('scales linearly with authenticity', () => {
    const fresh = { created_at: minutesAgo(0) }
    expect(claimWeight(claim({ post_id: 'a', assertion: 'x', authenticity: 80, ...fresh }), NOW))
      .toBeCloseTo(0.8, 6)
    expect(claimWeight(claim({ post_id: 'b', assertion: 'x', authenticity: 40, ...fresh }), NOW))
      .toBeCloseTo(0.4, 6)
  })
})

describe('corroborationFactor', () => {
  it('gives a lone report no bonus', () => {
    expect(corroborationFactor(1)).toBe(1)
  })

  it('rewards independent authors on a log scale, not linearly', () => {
    const two = corroborationFactor(2)
    const four = corroborationFactor(4)
    expect(two).toBeCloseTo(1.35, 6)
    expect(four).toBeCloseTo(1.7, 6)
    // Doubling again adds the same amount, not double the amount.
    expect(four - two).toBeCloseTo(two - 1, 6)
  })

  it('caps, so a brigade cannot manufacture truth', () => {
    expect(corroborationFactor(1000)).toBe(CORROBORATION_CAP)
  })
})

describe('incidentConfidence', () => {
  it('passes a unanimous single report through at its own confidence', () => {
    expect(incidentConfidence(80, 1, 1)).toBe(80)
  })

  it('costs an evenly split verdict a quarter, not all of it', () => {
    // agreement 0.5 -> multiplier 0.75. A contested report is still a report.
    expect(incidentConfidence(80, 0.5, 1)).toBe(60)
  })

  it('rises with independent corroboration', () => {
    expect(incidentConfidence(60, 1, 2)).toBeGreaterThan(incidentConfidence(60, 1, 1))
  })

  it('never exceeds 100', () => {
    expect(incidentConfidence(100, 1, 8)).toBe(100)
  })
})

describe('resolveConflict', () => {
  it('returns a do-nothing verdict for no claims', () => {
    const verdict = resolveConflict([], { now: NOW })
    expect(verdict.assertion).toBe('none')
    expect(verdict.confidence).toBe(0)
    expect(verdict.action).toBe('suggest')
  })

  /**
   * The worked example from SIGNAL.md.
   *
   * Two residents, same block, same window, contradicting each other.
   *   p-100  "flooding",  5 min old, authenticity 85, confidence 80
   *   p-101  "none",     25 min old, authenticity 60, confidence 70
   *
   * weights: p-100 = 0.85 * 2^(-5/30)  = 0.7568
   *          p-101 = 0.60 * 2^(-25/30) = 0.3369
   * one author each, so no corroboration multiplier on either side.
   * agreement = 0.7568 / 1.0937 = 0.692
   * confidence = 80 * (0.5 + 0.5*0.692) * 1.0 = 67.7
   * 67.7 >= 55, so the agent may act - and the dissent is recorded, not dropped.
   */
  it('weighs recency and authenticity, and keeps the dissent', () => {
    const verdict = resolveConflict([
      claim({ post_id: 'p-100', assertion: 'flooding', created_at: minutesAgo(5), authenticity: 85, confidence: 80 }),
      claim({ post_id: 'p-101', assertion: 'none', created_at: minutesAgo(25), authenticity: 60, confidence: 70 }),
    ], { now: NOW, floor: 55 })

    expect(verdict.assertion).toBe('flooding')
    expect(verdict.weight).toBeCloseTo(0.757, 2)
    expect(verdict.opposing_weight).toBeCloseTo(0.337, 2)
    expect(verdict.agreement).toBeCloseTo(0.692, 2)
    expect(verdict.confidence).toBeCloseTo(67.7, 1)
    expect(verdict.action).toBe('act')

    // The whole point: the losing report is still here.
    expect(verdict.dissent).toHaveLength(1)
    expect(verdict.dissent[0]?.post_id).toBe('p-101')
    expect(verdict.dissent[0]?.assertion).toBe('none')
  })

  it('drops below the floor to suggest-only when the split is near even', () => {
    const verdict = resolveConflict([
      claim({ post_id: 'p-1', assertion: 'flooding', authenticity: 50, confidence: 55 }),
      claim({ post_id: 'p-2', assertion: 'none', authenticity: 50, confidence: 55 }),
    ], { now: NOW, floor: 55 })

    expect(verdict.agreement).toBeCloseTo(0.5, 6)
    expect(verdict.confidence).toBeLessThan(55)
    expect(verdict.action).toBe('suggest')
  })

  it('lets three independent authors outweigh one stronger lone report', () => {
    const verdict = resolveConflict([
      claim({ post_id: 'p-a', user_id: 'u-1', assertion: 'fallen_tree', authenticity: 55 }),
      claim({ post_id: 'p-b', user_id: 'u-2', assertion: 'fallen_tree', authenticity: 55 }),
      claim({ post_id: 'p-c', user_id: 'u-3', assertion: 'fallen_tree', authenticity: 55 }),
      claim({ post_id: 'p-d', user_id: 'u-4', assertion: 'none', authenticity: 95 }),
    ], { now: NOW })

    expect(verdict.assertion).toBe('fallen_tree')
    expect(verdict.authors).toBe(3)
  })

  it('counts authors, not posts, so one person posting six times is one voice', () => {
    const spam = Array.from({ length: 6 }, (_, i) =>
      claim({ post_id: `p-s${i}`, user_id: 'u-loud', assertion: 'fire', authenticity: 40 }))
    const verdict = resolveConflict([
      ...spam,
      claim({ post_id: 'p-x', user_id: 'u-1', assertion: 'none', authenticity: 90 }),
      claim({ post_id: 'p-y', user_id: 'u-2', assertion: 'none', authenticity: 90 }),
    ], { now: NOW })

    // Six posts of 0.4 sum to 2.4 but earn no corroboration bonus; two posts of
    // 0.9 sum to 1.8 and earn 1.35x for two authors = 2.43.
    expect(verdict.assertion).toBe('none')
    expect(verdict.authors).toBe(2)
  })

  describe('tie-breaking', () => {
    it('reports no tie-break when weight alone decides', () => {
      const verdict = resolveConflict([
        claim({ post_id: 'p-1', assertion: 'flooding', authenticity: 90 }),
        claim({ post_id: 'p-2', assertion: 'none', authenticity: 10 }),
      ], { now: NOW })
      expect(verdict.tie_break).toBe('none')
    })

    it('breaks an exact tie on distinct authors first', () => {
      // Two sides at identical total weight. Two authors at 1.0 each weigh 2.0
      // and earn the 1.35x two-author factor: 2.7. One person posting three
      // times at 0.9 weighs 2.7 and earns no factor at all. Breadth wins.
      const verdict = resolveConflict([
        claim({ post_id: 'p-1', user_id: 'u-1', assertion: 'flooding', authenticity: 100 }),
        claim({ post_id: 'p-2', user_id: 'u-2', assertion: 'flooding', authenticity: 100 }),
        claim({ post_id: 'p-3', user_id: 'u-3', assertion: 'none', authenticity: 90 }),
        claim({ post_id: 'p-4', user_id: 'u-3', assertion: 'none', authenticity: 90 }),
        claim({ post_id: 'p-5', user_id: 'u-3', assertion: 'none', authenticity: 90 }),
      ], { now: NOW })
      expect(verdict.assertion).toBe('flooding')
      expect(verdict.tie_break).toBe('authors')
    })

    it('is deterministic: the same input always gives the same verdict', () => {
      const claims = [
        claim({ post_id: 'p-2', user_id: 'u-2', assertion: 'none', authenticity: 70 }),
        claim({ post_id: 'p-1', user_id: 'u-1', assertion: 'flooding', authenticity: 70 }),
      ]
      const first = resolveConflict(claims, { now: NOW })
      const second = resolveConflict([...claims].reverse(), { now: NOW })
      expect(second.assertion).toBe(first.assertion)
      expect(second.confidence).toBe(first.confidence)
      expect(second.tie_break).toBe(first.tie_break)
    })
  })
})

describe('dissentNote', () => {
  it('says so plainly when nothing contradicts', () => {
    const verdict = resolveConflict([claim({ post_id: 'p-1', assertion: 'flooding' })], { now: NOW })
    expect(dissentNote(verdict)).toBe('No contradicting reports.')
  })

  it('names the strongest contradicting report and the agreement level', () => {
    const verdict = resolveConflict([
      claim({ post_id: 'p-1', assertion: 'flooding', authenticity: 90 }),
      claim({ post_id: 'p-2', assertion: 'none', authenticity: 40 }),
    ], { now: NOW })
    const note = dissentNote(verdict)
    expect(note).toContain('p-2')
    expect(note).toContain('1 contradicting report')
    expect(note).toMatch(/Agreement \d+%/)
  })
})
