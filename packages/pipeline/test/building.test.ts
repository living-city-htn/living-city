import { describe, expect, it } from 'vitest'
import { describeBuilding, validateBuildingSpec } from '../src/building'
import type { SearchProvider, SearchResult } from '../src/building/search'
import type { ModelProvider, ModelRequest, ModelResponse } from '../src/provider/types'
import { ModelError } from '../src/provider/types'

/**
 * The building call's contract, in one sentence per test: it never throws at
 * the caller, it spends at most one search, and a bad second pass never costs
 * the user a good first one.
 */

const spec = (over: Record<string, unknown> = {}) => ({
  schema_version: 'building.v1',
  name: 'Cafe Pyrus',
  summary: 'A small brick cafe with a green awning.',
  kind: 'cafe',
  height: 'low',
  storeys: 1,
  palette: 'brick_red',
  mood: 'cozy',
  identity_tags: ['brick', 'cozy'],
  features: ['outdoor_seating'],
  confidence: 80,
  needs_reference: false,
  search_query: null,
  ...over,
})

/** Answers each call from a queue, and records what it was asked. */
const fakeProvider = (answers: unknown[]): ModelProvider & { seen: ModelRequest[] } => {
  const seen: ModelRequest[] = []
  let call = 0
  return {
    name: 'fake',
    seen,
    available: () => true,
    async complete(req: ModelRequest): Promise<ModelResponse> {
      seen.push(req)
      const json = answers[call++]
      if (json instanceof ModelError) throw json
      return {
        json, raw: JSON.stringify(json), attempts: 1,
        model: 'fake', provider: 'fake', latencyMs: 1,
      }
    },
  }
}

const fakeSearch = (results: SearchResult[]): SearchProvider & { calls: string[] } => {
  const calls: string[] = []
  return {
    name: 'fake-search',
    calls,
    available: () => true,
    async search(query: string) { calls.push(query); return results },
  }
}

const REFERENCE: SearchResult[] = [
  { title: 'Cafe Pyrus', url: 'https://example.invalid/a', snippet: 'Brick cafe.' },
]

const base = { description: 'the brick cafe on King', imageUrl: null }

describe('describeBuilding', () => {
  it('is disabled, not broken, when no provider is configured', async () => {
    const provider: ModelProvider = {
      name: 'none', available: () => false,
      complete: () => { throw new Error('must not be called') },
    }
    const result = await describeBuilding(base, { provider })
    expect(result).toMatchObject({ spec: null, degraded: 'disabled', attempts: 0 })
  })

  it('answers in one pass when the model says it has enough', async () => {
    const provider = fakeProvider([spec()])
    const search = fakeSearch(REFERENCE)
    const result = await describeBuilding(base, { provider, search })

    expect(result.degraded).toBe('none')
    expect(result.searched).toBe(false)
    expect(result.spec?.name).toBe('Cafe Pyrus')
    expect(search.calls).toEqual([])
    expect(provider.seen).toHaveLength(1)
  })

  it('searches once, then revises, when the model asks for a reference', async () => {
    const provider = fakeProvider([
      spec({ needs_reference: true, search_query: 'Cafe Pyrus Kitchener', confidence: 40 }),
      spec({ confidence: 88, storeys: 2 }),
    ])
    const search = fakeSearch(REFERENCE)
    const result = await describeBuilding(base, { provider, search })

    expect(search.calls).toEqual(['Cafe Pyrus Kitchener'])
    expect(provider.seen).toHaveLength(2)
    expect(result.searched).toBe(true)
    expect(result.spec?.confidence).toBe(88)
    expect(result.spec?.storeys).toBe(2)
    // Sources come from the search, never from the model.
    expect(result.spec?.sources).toEqual(['https://example.invalid/a'])
    // There is no third pass, so the flag must not survive.
    expect(result.spec?.needs_reference).toBe(false)
  })

  it('only ever spends one search', async () => {
    const provider = fakeProvider([
      spec({ needs_reference: true, search_query: 'first' }),
      spec({ needs_reference: true, search_query: 'again' }),
    ])
    const search = fakeSearch(REFERENCE)
    await describeBuilding(base, { provider, search })
    expect(search.calls).toHaveLength(1)
  })

  it('ships the first answer when the search finds nothing', async () => {
    const provider = fakeProvider([
      spec({ needs_reference: true, search_query: 'nothing here' }),
    ])
    const search = fakeSearch([])
    const result = await describeBuilding(base, { provider, search })

    expect(provider.seen).toHaveLength(1)
    expect(result.searched).toBe(false)
    expect(result.spec?.name).toBe('Cafe Pyrus')
    expect(result.spec?.needs_reference).toBe(false)
  })

  it('keeps the first answer when the revision comes back unusable', async () => {
    const provider = fakeProvider([
      spec({ needs_reference: true, search_query: 'q', confidence: 42 }),
      { garbage: true },
    ])
    const search = fakeSearch(REFERENCE)
    const result = await describeBuilding(base, { provider, search })

    expect(result.degraded).toBe('none')
    expect(result.spec?.confidence).toBe(42)
    expect(result.spec?.sources).toEqual(['https://example.invalid/a'])
    expect(result.corrections.join(' ')).toContain('kept the first answer')
  })

  it('does not spend a search on a first answer it could not read', async () => {
    const provider = fakeProvider([{ not: 'a spec' }])
    const search = fakeSearch(REFERENCE)
    const result = await describeBuilding(base, { provider, search })

    expect(result).toMatchObject({ spec: null, degraded: 'unreadable', searched: false })
    expect(search.calls).toEqual([])
  })

  it('turns a transport failure into a state rather than an exception', async () => {
    const provider = fakeProvider([new ModelError('timeout', 'transport', 2)])
    const result = await describeBuilding(base, { provider, search: fakeSearch([]) })
    expect(result).toMatchObject({ spec: null, degraded: 'unavailable' })
  })

  it('never lets a search failure fail the request', async () => {
    const provider = fakeProvider([spec({ needs_reference: true, search_query: 'q' })])
    const search: SearchProvider = {
      name: 'exploding', available: () => true,
      search: async () => { throw new Error('network down') },
    }
    const result = await describeBuilding(base, { provider, search })
    expect(result.degraded).toBe('none')
    expect(result.spec?.name).toBe('Cafe Pyrus')
    expect(result.searched).toBe(false)
  })
})

describe('validateBuildingSpec', () => {
  it('clamps storeys instead of rejecting the whole answer', () => {
    const corrections: string[] = []
    const result = validateBuildingSpec(spec({ storeys: 40 }), [], corrections)
    expect(result?.storeys).toBe(8)
    expect(corrections.join(' ')).toContain('clamped')
  })

  it('replaces sources rather than trusting the model with them', () => {
    const result = validateBuildingSpec(
      spec({ sources: ['https://made-up.invalid'] }),
      ['https://real.invalid'],
    )
    expect(result?.sources).toEqual(['https://real.invalid'])
  })

  it('drops a query the model did not flag, so the pair always agrees', () => {
    const result = validateBuildingSpec(
      spec({ needs_reference: false, search_query: 'stray query' }), [],
    )
    expect(result?.search_query).toBeNull()
  })

  it('rejects a value outside the shared vocabulary', () => {
    expect(validateBuildingSpec(spec({ kind: 'spaceport' }), [])).toBeNull()
  })

  it('rejects anything that is not an object', () => {
    expect(validateBuildingSpec(null, [])).toBeNull()
    expect(validateBuildingSpec('a building', [])).toBeNull()
  })
})
