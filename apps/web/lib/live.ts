/**
 * Live update. docs/02 section 10 and docs/04 section 7.
 *
 * The scene polls a cheap version endpoint every five seconds and rebuilds only
 * the blocks whose plan id changed. No server push, no SSE. This is what lets a
 * judge watch their own block change without anyone touching the operator
 * laptop — which is the whole of moment 8.
 */
import type { CommunityPlan } from '@living-city/fixtures'

export const POLL_MS = 5_000

export type CityVersion = {
  plans: Record<string, string>
  updated_at: string
  /**
   * The block running the City Hall rehearsal, or null. An operator control
   * that rides this poll rather than one of its own, because every judge's
   * phone is already asking this endpoint what changed.
   */
  drill?: string | null
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * `drill` is checked but not required: a response without it is a valid
 * version, so an older deploy answering this poll degrades to "nobody is
 * drilling" instead of blanking the city.
 */
export const isCityVersion = (v: unknown): v is CityVersion =>
  record(v) && record(v.plans) && typeof v.updated_at === 'string' &&
  Object.values(v.plans).every((p) => typeof p === 'string') &&
  (v.drill === undefined || v.drill === null || typeof v.drill === 'string')

export async function getCityVersion(signal?: AbortSignal): Promise<CityVersion> {
  const response = await fetch('/api/city/version', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`city version returned ${response.status}`)
  const body: unknown = await response.json()
  if (!isCityVersion(body)) throw new Error('Unreadable city version')
  return body
}

/**
 * Which blocks need re-fetching: a plan id we have never seen, or one that
 * differs from the plan we are holding. A block missing from the response is
 * left alone rather than blanked, because a partial version response should
 * never wipe a block the judge is looking at.
 */
export function changedPlanIds(version: CityVersion, known: Record<string, string>): string[] {
  return Object.entries(version.plans)
    .filter(([communityId, planId]) => known[communityId] !== planId)
    .map(([communityId]) => communityId)
}

/** The plan ids we currently hold, keyed by community. */
export const planIdsOf = (plans: CommunityPlan[]): Record<string, string> =>
  Object.fromEntries(plans.map((p) => [p.community_id, p.plan_id]))

/**
 * Replace the plans we re-fetched, keep the rest. Order is not meaningful to
 * the scene, but keeping it stable avoids pointless re-renders.
 */
export function mergePlans(current: CommunityPlan[], fresh: CommunityPlan[]): CommunityPlan[] {
  if (fresh.length === 0) return current
  const byId = new Map(fresh.map((p) => [p.community_id, p]))
  const merged = current.map((p) => byId.get(p.community_id) ?? p)
  for (const p of fresh) {
    if (!current.some((c) => c.community_id === p.community_id)) merged.push(p)
  }
  return merged
}
