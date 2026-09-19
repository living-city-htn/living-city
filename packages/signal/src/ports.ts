/**
 * The seam between this package and wherever the rows actually live.
 *
 * `packages/signal` must not import `@living-city/fixtures/store` or reach into
 * `apps/web/lib/pipeline.ts`: those belong to other owners, and the store they
 * hold is module memory today and a database later. So the package declares
 * what it needs and the web app supplies it, the same way `setProvider` works
 * in `packages/pipeline/src/provider/index.ts`.
 *
 * This is also the answer to "every write goes to Postgres". There is no
 * Postgres in this repo yet - `DATABASE_URL` is in `.env.example` and nothing
 * reads it, and both incident stores are module memory. So the agent's writes
 * go through this port, which is shaped like the database boundary
 * (`packages/civic/src/in-memory.ts` does the same for the same reason). When
 * the migrations land, one implementation changes and nothing in this package
 * moves.
 */
import type { Incident, PostAnalysis } from '@living-city/contracts'
import type { IndexableBlock, IndexablePost } from './doc'

/** A post the layer can reason about: the row plus its analysis. */
export type EvidenceRecord = {
  post: IndexablePost
  analysis: PostAnalysis
  block?: IndexableBlock
  engagement?: number
}

export type EvidenceQuery = {
  blockId?: string
  /** ISO timestamp; records older than this are excluded. */
  since?: string
  limit?: number
}

export type CivicReadPort = {
  /**
   * The fallback for every retrieval path in this package. Called whenever
   * Elasticsearch is unavailable, which is why it must be cheap and must never
   * throw: returning an empty array is a valid answer.
   */
  listEvidence(query: EvidenceQuery): EvidenceRecord[]
  listIncidents(filter?: { community?: string; status?: Incident['status'] }): Incident[]
}

let read: CivicReadPort | null = null

/** Called once by the web app at module load. Tests inject a fake. */
export const setCivicReadPort = (port: CivicReadPort | null): void => { read = port }

/**
 * Null when nothing has been wired up - which is a legitimate state, not a
 * bug: a CLI script that only indexes never needs a read port. Callers treat
 * null as "no fallback available" and answer with an empty result rather than
 * throwing.
 */
export const civicRead = (): CivicReadPort | null => read
