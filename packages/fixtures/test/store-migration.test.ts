import { describe, expect, it } from 'vitest'
import { deserializeState } from '../src/store'
import type { Serialized } from '../src/persist'

const legacyState = (overrides: Partial<Serialized> = {}): Serialized => ({
  posts: [{ id: 'p-12' }],
  users: [],
  likes: [],
  balances: [],
  inventory: [],
  placements: [],
  plans: [],
  incidents: [],
  updatedAt: '2026-09-19T00:00:00.000Z',
  seq: 12,
  qrPaused: false,
  ...overrides,
})

describe('fixture-store durable state migration', () => {
  it('advances the sequence past legacy placement ids', () => {
    const restored = deserializeState(legacyState({
      seq: 12,
      placements: [{ id: 'pl-93' }],
    }))

    expect(restored.seq).toBe(93)
  })

  it('conservatively blocks rewards for legacy posts without credit history', () => {
    const restored = deserializeState(legacyState({
      posts: [{ id: 'p-old' }],
      likes: [],
    }))

    expect(restored.likeCreditBlockedPostIds).toEqual(new Set(['p-old']))
  })

  it('does not block rewards in state written by the current schema', () => {
    const restored = deserializeState(legacyState({ likeCredits: [] }))

    expect(restored.likeCreditBlockedPostIds).toEqual(new Set())
  })
})
