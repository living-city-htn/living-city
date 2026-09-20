/**
 * The role gate for civic routes.
 *
 * **Read this before trusting it.** Identity in this app is
 * `lib/stub.ts:currentUser()`, a hard-coded resident, because the real thing -
 * a middleware that auto-creates a User per device cookie - is Civic's Stage 1
 * item and does not exist yet. The existing civic routes say so in a comment
 * and are not gated at all.
 *
 * So this is a gate in shape, not in strength: it resolves a role, refuses
 * anything that is not `government`, and reads that role from a header or
 * cookie that a caller could simply set. It is not authentication and must not
 * be described as such. What it buys is that every signal route has the check
 * in it, in one place, so when the middleware lands this file changes and no
 * route does.
 *
 * The operator page is already unauthenticated by design - judges never see it
 * (see the header comment on app/operator/page.tsx) - so this does not make the
 * demo weaker than it was. It makes the seam explicit.
 */
import { currentUser, json } from '@/lib/stub'

export type CivicRole = 'resident' | 'government'

const ROLE_HEADER = 'x-lc-role'
const ROLE_COOKIE = 'lc_role'

const fromCookie = (req: Request): CivicRole | null => {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === ROLE_COOKIE && value === 'government') return 'government'
  }
  return null
}

/** The caller's role, by the best evidence available today. */
export const roleOf = (req: Request): CivicRole => {
  if (req.headers.get(ROLE_HEADER) === 'government') return 'government'
  const cookie = fromCookie(req)
  if (cookie) return cookie
  return currentUser().role
}

/**
 * Returns a 403 response to return, or null to continue. Used as:
 *
 *   const denied = requireGovernment(req)
 *   if (denied) return denied
 */
export const requireGovernment = (req: Request): Response | null => {
  if (roleOf(req) === 'government') return null
  return json({ error: 'this route is for city staff', code: 'FORBIDDEN' }, 403)
}

/** The header the operator page sends. Exported so the client and the server
 *  cannot disagree about its name. */
export const STAFF_HEADER = { [ROLE_HEADER]: 'government' } as const
