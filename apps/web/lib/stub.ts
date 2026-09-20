/**
 * Shared helpers for the stub API (USE_FIXTURES=1).
 *
 * WRITES DO NOT PERSIST. The store behind these routes is a module-level object
 * in `packages/fixtures/src/store.ts`, so it lives in one process's memory:
 *
 *   - locally, it resets whenever Next re-evaluates the module (lazy route
 *     compilation on first hit, and every HMR reload);
 *   - deployed, every function invocation may be a cold process, so a like,
 *     a purchase or a placement can vanish between two requests.
 *
 * Reads are fine, which is what Stage 1 needs. This is exactly why docs/02
 * section 6 puts the ledger, inventory, placements and incidents in Postgres:
 * "in-memory is no longer enough". Civic's game CRUD against the database
 * (Stage 1) is what makes writes real; until then do not trust a write you
 * made in one request to be visible in the next.
 *
 * Every route under app/api is Product's stub until its real owner lands it:
 * post and plan routes go to Pipeline, identity / game / civic routes go to
 * Civic (docs/05 section 2). Keep the request and response shapes from
 * docs/02 section 8 exactly; the body is throwaway, the contract is not.
 */
import { NextResponse } from 'next/server'
import { seedUsers } from '@living-city/fixtures'
import { getState, likeCount } from '@living-city/fixtures/store'
import {
  AUTHENTICITY_GATE, authenticityOf, isUnverified, type Authenticity,
} from './authenticity'
import { currentUser as resolveUser, isGovernment, type AppUser } from './identity'

export const USE_FIXTURES = process.env.USE_FIXTURES !== '0'

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
export const badRequest = (message: string) => json({ error: message }, 400)
export const forbidden = (message = 'government access required') => json({ error: message }, 403)
export const notFound = (message = 'not found') => json({ error: message }, 404)

/**
 * Identity is Civic's, from Stage 1: a middleware that auto-creates a User per
 * device cookie and exposes currentUser(req). The middleware owns cookie
 * creation; this adapter keeps the existing route and fixture signatures
 * stable while Civic's database-backed User row is still pending.
 */
export const currentUser = (request?: Request): AppUser => resolveUser(request)

export const governmentUser = (): AppUser => ({ id: 'u-gov', display_name: 'City of Kitchener (Staff)', role: 'government' })

export const requireGovernment = (request: Request): AppUser | Response => {
  const user = currentUser(request)
  return isGovernment(user) ? user : forbidden()
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T } catch { return null }
}

/** Next 15 hands route params in as a promise. */
export type RouteCtx<T> = { params: Promise<T> }

/**
 * A post plus what every surface that lists one needs: who wrote it, how many
 * likes it has, and whether the viewer is one of them.
 *
 * `author_name` and the like fields are not in the `Post` row (docs/02 section
 * 7) because they are joins, not columns. The feed and the block panel both
 * need them, so the real post routes should return them too when Pipeline and
 * Civic take these over. Nothing here changes the contract.
 */
export type PostWithMeta = {
  id: string
  author_name: string
  likes: number
  liked: boolean
  [key: string]: unknown
}

export function withPostMeta<T extends { id: string; user_id: string }>(posts: T[], viewerId = currentUser().id): Array<T & {
  author_name: string
  likes: number
  liked: boolean
  authenticity: Authenticity | null
  unverified: boolean
}> {
  const names = new Map(seedUsers.map((u) => [u.id, u.display_name]))
  const likes = getState().likes
  return posts.map((p) => {
    // Advisory, and absent entirely when the gate is off. A null score means
    // the gate had no opinion, never that the post is suspect.
    const authenticity = AUTHENTICITY_GATE ? authenticityOf(p.id) : null
    return {
      ...p,
      author_name: names.get(p.user_id) ?? 'Resident',
      likes: likeCount(p.id),
      liked: likes.has(`${viewerId}:${p.id}`),
      authenticity,
      unverified: isUnverified(authenticity),
    }
  })
}
