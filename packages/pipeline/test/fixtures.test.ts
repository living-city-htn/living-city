import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planningInput, postAnalysis } from '@living-city/contracts'
import { FALLBACK_TAXONOMY, loadTaxonomy } from '../src/taxonomy'

/**
 * The two fixtures Pipeline owes the team (docs/roles/pipeline.md Stage 0)
 * have to parse against the contracts, or the modules built on them are built
 * on a lie. This is the check that keeps them honest as the prompts change.
 */

const read = (name: string) =>
  JSON.parse(readFileSync(resolve(`packages/fixtures/data/${name}`), 'utf8'))

describe('post-analysis.mock.json', () => {
  const mock = read('post-analysis.mock.json') as { analyses: unknown[] }

  it('every analysis parses as a PostAnalysis', () => {
    for (const raw of mock.analyses) {
      const result = postAnalysis.safeParse(raw)
      const id = (raw as { post_id?: string }).post_id
      expect(
        result.success,
        `${id}: ${result.success ? '' : result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      ).toBe(true)
    }
  })

  it('covers the three seeded incidents and leaves the near-misses alone', () => {
    const byId = new Map(
      mock.analyses.map((a) => [(a as { post_id: string }).post_id, postAnalysis.parse(a)]),
    )
    // docs/04 section 3: three seeded incidents, one of them the scripted one.
    for (const id of ['p-007', 'p-020', 'p-022']) {
      expect(byId.get(id)?.incident.type, `${id} should carry an incident`).not.toBe('none')
      expect(byId.get(id)?.incident.evidence).toBe('form')
    }
    // docs/03 rules 23 and 27: a reopened road and a tripped breaker are not
    // incidents, however much they sound like one.
    for (const id of ['p-012', 'p-021']) {
      expect(byId.get(id)?.incident.type, `${id} must not carry an incident`).toBe('none')
    }
    // Rule 13: an injection attempt is data, and scores as off-topic.
    const injection = byId.get('p-011')
    expect(injection?.content_flags).toContain('instruction_like')
    expect(injection?.about_location).toBeLessThanOrEqual(20)
  })

  it('uses only tags from the controlled vocabulary', () => {
    const controlled = new Set(FALLBACK_TAXONOMY.enums.tags ?? [])
    for (const raw of mock.analyses) {
      const analysis = postAnalysis.parse(raw)
      for (const tag of analysis.tags) {
        expect(controlled.has(tag), `${analysis.post_id}: unknown tag "${tag}"`).toBe(true)
      }
    }
  })
})

describe('planning-input.mock.json', () => {
  const mock = read('planning-input.mock.json') as Record<string, unknown>
  const scenarios = ['rich_event', 'sparse_previous', 'empty_no_plan']

  it('every scenario parses as a PlanningInput', () => {
    const taxonomy = loadTaxonomy()
    for (const name of scenarios) {
      const result = planningInput.safeParse({ ...(mock[name] as object), taxonomy })
      expect(
        result.success,
        `${name}: ${result.success ? '' : result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      ).toBe(true)
    }
  })

  it('rich_event is set up so the archetype must NOT change', () => {
    const input = mock.rich_event as { consecutive_windows_supporting_change: number; current: { temporal_mix: { moment: number } } }
    // Rule 11 needs 2 supporting windows; this has 1, so the spike has to come
    // out as effects and lighting instead.
    expect(input.consecutive_windows_supporting_change).toBe(1)
    expect(input.current.temporal_mix.moment).toBeGreaterThan(0.6)
  })

  it('empty_no_plan has nothing to fall back on but the zoning default', () => {
    const input = mock.empty_no_plan as { previous_plan: unknown; window: { data_sufficiency: string } }
    expect(input.previous_plan).toBeNull()
    expect(input.window.data_sufficiency).toBe('none')
  })
})
