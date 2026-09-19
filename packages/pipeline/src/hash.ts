import { createHash } from 'node:crypto'

/**
 * Stable hash of an arbitrary value, used for the planning cadence and replay.
 *
 * docs/02 section 4.4: `POST /api/plan/tick` replans only communities whose
 * input hash changed. docs/03 section 9: hash `PlanningInput` minus timestamps
 * and store the hash with the plan.
 *
 * Key order must not matter, or an unchanged community would look changed and
 * burn a Call B on every tick.
 */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key])
    }
    return out
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    // Float noise from the aggregator must not invalidate a hash.
    return Number(value.toFixed(4))
  }
  return value
}

export const stableHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex').slice(0, 16)

/** Fields that move every tick and would defeat the point of hashing. */
const VOLATILE = new Set(['start', 'end', 'plan_id', 'created_at', 'updated_at'])

const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE.has(k)) continue
      out[k] = stripVolatile(v)
    }
    return out
  }
  return value
}

/** The hash stored on `CommunityState.input_hash`. Timestamps excluded. */
export const planningInputHash = (input: unknown): string => stableHash(stripVolatile(input))
