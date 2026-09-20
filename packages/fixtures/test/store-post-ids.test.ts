import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Serialized } from '../src/persist'

/**
 * Post ids have to be unique, because the Feed keys its cards on them: two
 * cards with one id is a React key warning and a doubled post on stage.
 *
 * The bug this started from was not a race. `reset()` set `seq` to the number
 * of seed posts while the seed's ids ran past that number - it has gaps, left
 * by narrowing the city to Waterloo - so the first post after a reset minted an
 * id a seed post already had. No concurrency and no database needed.
 *
 * The concurrent cases below are moment 8 (docs/04 section 7): judges posting
 * from their phones at the same moment, and a save that commits but reports
 * failure because its response was lost.
 */

/** A fake Neon row with the compare-and-set semantics of `persist.save`. */
const db = {
  durable: false,
  row: null as { data: Serialized; version: number } | null,
  /** Commit the next N saves but report them as failures, as a lost response does. */
  lieOnSave: 0,
  saves: 0,
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

vi.mock('../src/persist', () => ({
  durable: () => db.durable,
  load: async () => {
    await new Promise((r) => setTimeout(r, 1))
    return db.row ? { data: clone(db.row.data), version: db.row.version } : null
  },
  save: async (data: Serialized, version: number) => {
    const snapshot = clone(data)
    await new Promise((r) => setTimeout(r, 1))
    db.saves++
    if (!db.row) {
      if (version !== 0) return false
      db.row = { data: snapshot, version: 1 }
      return true
    }
    if (db.row.version !== version) return false
    db.row = { data: snapshot, version: db.row.version + 1 }
    if (db.lieOnSave > 0) { db.lieOnSave--; return false }   // committed, reported false
    return true
  },
  overwrite: async (data: Serialized) => {
    db.row = { data: clone(data), version: (db.row?.version ?? 0) + 1 }
  },
}))

const { balance, createPost, getState, reset, resetDurable, write } = await import('../src/store')
const { seedPosts, seedUsers } = await import('../src/index')

const seedIds = new Set(seedPosts.map((p) => p.id))
const storeIds = () => getState().posts.map((p) => p.id)
const rowIds = () => (db.row!.data.posts as Array<{ id: string }>).map((p) => p.id)
const duplicates = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))]

// A judge posting from a phone, not the government account.
const author = seedUsers.find((u) => u.role !== 'government')
if (!author) throw new Error('the seed needs a non-government user')
const AUTHOR = author.id
const post = (n: number) =>
  createPost({
    user_id: AUTHOR, text: `judge post ${n}`,
    lon: -80.54, lat: 43.47, community_id: 'kw:laurelwood',
  })

describe('seeded ids', () => {
  it('the seed itself has no duplicate ids', () => {
    expect(duplicates([...seedIds])).toEqual([])
    expect(seedIds.size).toBe(seedPosts.length)
  })

  it('seq starts at the highest seed id, not the number of seed posts', () => {
    reset()
    const highest = Math.max(...seedPosts.map((p) => Number(p.id.slice(2))))
    expect(getState().seq).toBe(highest)
    // The regression: the seed has gaps, so these two genuinely differ.
    expect(highest).toBeGreaterThan(seedPosts.length)
  })
})

describe('createPost', () => {
  beforeEach(() => { db.durable = false; db.row = null; reset() })

  it('never mints an id a seed post already has', () => {
    for (let i = 1; i <= 5; i++) {
      const p = post(i)
      expect(seedIds.has(p.id), `post ${i} minted ${p.id}, which is already a seed post`).toBe(false)
    }
    expect(duplicates(storeIds())).toEqual([])
  })

  it('keeps ids unique across many posts', () => {
    for (let i = 1; i <= 50; i++) post(i)
    const ids = storeIds()
    expect(duplicates(ids)).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('steps over ids a stale durable row left behind', () => {
    // A row written by the build that had this bug: seq counted the posts.
    getState().seq = seedPosts.length
    const p = post(1)
    expect(seedIds.has(p.id)).toBe(false)
    expect(duplicates(storeIds())).toEqual([])
  })
})

describe('simultaneous posters', () => {
  beforeEach(async () => { db.durable = true; db.row = null; db.lieOnSave = 0; await resetDurable() })

  // One writer wins each round, so the Nth needs N attempts. Twelve is past the
  // old budget of four, which failed outright from five posters up.
  for (const posters of [2, 4, 8, 12]) {
    it(`${posters} at once all succeed with distinct ids`, async () => {
      const made = await Promise.all(
        Array.from({ length: posters }, (_, i) => write(() => post(i + 1))),
      )
      const ids = made.map((p) => p.id)
      expect(new Set(ids).size, `minted ${ids.join(', ')}`).toBe(posters)
      for (const id of ids) expect(seedIds.has(id)).toBe(false)

      // The row everyone shares ends up with one row per post and no duplicates.
      expect(duplicates(rowIds())).toEqual([])
      expect(rowIds().length).toBe(seedPosts.length + posters)
    })
  }

  it('repeated rounds of two posters never collide', async () => {
    for (let round = 0; round < 15; round++) {
      db.row = null
      await resetDurable()
      const [a, b] = await Promise.all([write(() => post(1)), write(() => post(2))])
      expect(a.id, `round ${round}`).not.toBe(b.id)
    }
  })
})

describe('a save that commits but reports failure', () => {
  beforeEach(async () => { db.durable = true; db.row = null; db.lieOnSave = 0; await resetDurable() })

  it('writes the post once, not twice', async () => {
    db.lieOnSave = 1
    const created = await write(() => post(1))

    expect(rowIds().length, 'one tap must leave one post').toBe(seedPosts.length + 1)
    expect(duplicates(rowIds())).toEqual([])
    expect(rowIds()).toContain(created.id)
  })

  it('does not pay the author twice', async () => {
    const opening = balance(AUTHOR)
    db.lieOnSave = 1
    await write(() => post(1))
    // createPost credits 10 for a text-only post. docs/01 section 8.8.
    expect(balance(AUTHOR)).toBe(opening + 10)
  })

  it('is not fooled by another writer committing in between', async () => {
    // The stamp has to outlive someone else's write, or the retry cannot tell
    // its own lost save from a rejected one and applies the mutation twice.
    db.lieOnSave = 1
    const slow = write(() => post(1))
    await new Promise((r) => setTimeout(r, 4))   // A's save lands, reported lost
    await write(() => post(2))                   // B commits before A retries
    await slow

    expect(rowIds().length, 'two taps must leave two posts').toBe(seedPosts.length + 2)
    expect(duplicates(rowIds())).toEqual([])
  })

  it('still survives when several attempts in a row are lost', async () => {
    db.lieOnSave = 3
    await write(() => post(1))
    expect(rowIds().length).toBe(seedPosts.length + 1)
    expect(duplicates(rowIds())).toEqual([])
  })
})
