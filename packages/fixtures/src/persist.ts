/**
 * Durable storage for the stub's state.
 *
 * Rehearsing moment 8 on the deployed build showed why this is needed: the
 * state lived in one serverless instance's memory, so a judge's post landed in
 * one instance and their phone read another. Two clients disagreed about the
 * city — the operator pressed the preset and it never reached the phone.
 *
 * So the whole state travels as one JSONB row. It is small (tens of posts) and
 * the demo is two and a half minutes, so a row per request costs nothing and
 * every instance sees the same city.
 *
 * This is Product's stub getting honest about serverless, not Civic's game
 * service. When their Postgres-backed CRUD lands it replaces this; the
 * signatures in store.ts do not change either way.
 */
import { neon } from '@neondatabase/serverless'

/** `state` holds Sets and Maps, which JSON cannot carry on its own. */
export type Serialized = {
  posts: unknown[]
  users: unknown[]
  likes: string[]
  /** Likes that have already awarded their one-time points credit. */
  likeCredits?: string[]
  /** Legacy posts whose past like-credit history cannot be reconstructed. */
  likeCreditBlockedPostIds?: string[]
  balances: Array<[string, number]>
  inventory: Array<[string, Array<[string, number]>]>
  placements: unknown[]
  plans: Array<[string, unknown]>
  incidents: unknown[]
  updatedAt: string
  seq: number
  qrPaused: boolean
}

const connectionString = () =>
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? ''

/**
 * One row per environment. Local development and preview builds share the same
 * Neon database as production, and a rehearsal on a laptop must not overwrite
 * the city the judges are looking at.
 */
const ROW = () =>
  process.env.VERCEL_ENV === 'production' ? 1 : process.env.VERCEL_ENV === 'preview' ? 2 : 3

/** Off in local dev without a database; the in-memory store still works there. */
export const durable = () => connectionString().length > 0

let ready: Promise<void> | null = null

const sql = () => neon(connectionString())

async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS demo_state (
          id int PRIMARY KEY,
          data jsonb NOT NULL,
          version bigint NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

export type Loaded = { data: Serialized; version: number } | null

export async function load(): Promise<Loaded> {
  await ensureTable()
  const rows = (await sql()`SELECT data, version FROM demo_state WHERE id = ${ROW()}`) as Array<{
    data: Serialized
    version: string | number
  }>
  const row = rows[0]
  return row ? { data: row.data, version: Number(row.version) } : null
}

/**
 * Optimistic concurrency: the write only lands if nobody else wrote since we
 * read. Returns false when it did not, and the caller re-reads and re-applies.
 * Two judges posting in the same second is the case this protects.
 */
export async function save(data: Serialized, version: number): Promise<boolean> {
  await ensureTable()
  const json = JSON.stringify(data)
  if (version === 0) {
    const inserted = (await sql()`
      INSERT INTO demo_state (id, data, version) VALUES (${ROW()}, ${json}::jsonb, 1)
      ON CONFLICT (id) DO NOTHING
      RETURNING id`) as unknown[]
    return inserted.length > 0
  }
  const updated = (await sql()`
    UPDATE demo_state SET data = ${json}::jsonb, version = version + 1, updated_at = now()
    WHERE id = ${ROW()} AND version = ${version}
    RETURNING id`) as unknown[]
  return updated.length > 0
}

/** Used by the operator's reset, which is allowed to win. */
export async function overwrite(data: Serialized): Promise<void> {
  await ensureTable()
  const json = JSON.stringify(data)
  await sql()`
    INSERT INTO demo_state (id, data, version) VALUES (${ROW()}, ${json}::jsonb, 1)
    ON CONFLICT (id) DO UPDATE SET data = ${json}::jsonb,
      version = demo_state.version + 1, updated_at = now()`
}
