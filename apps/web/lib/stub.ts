/**
 * Shared helpers for the stub API (USE_FIXTURES=1).
 *
 * Every route under app/api is Product's stub until its real owner lands it:
 * post and plan routes go to Pipeline, identity / game / civic routes go to
 * Civic (docs/05 section 2). Keep the request and response shapes from
 * docs/02 section 8 exactly; the body is throwaway, the contract is not.
 */
import { NextResponse } from 'next/server'

export const USE_FIXTURES = process.env.USE_FIXTURES !== '0'

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
export const badRequest = (message: string) => json({ error: message }, 400)
export const notFound = (message = 'not found') => json({ error: message }, 404)

/**
 * Identity is Civic's, from Stage 1: a middleware that auto-creates a User per
 * device cookie and exposes currentUser(req). Until then this is the fixed test
 * user Product's contract calls for. Swap the body, keep the signature.
 */
export const currentUser = () => ({ id: 'u-mei', display_name: 'Mei L.', role: 'resident' as const })

export const governmentUser = () => ({ id: 'u-gov', display_name: 'City of Kitchener (Staff)', role: 'government' as const })

export async function readJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T } catch { return null }
}

/** Next 15 hands route params in as a promise. */
export type RouteCtx<T> = { params: Promise<T> }
