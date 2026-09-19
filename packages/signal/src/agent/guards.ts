/**
 * What stops the agent: rate, spend, retries, and having nothing to do.
 *
 * All four exist because the same failure looks different from each side. A
 * judge tapping "Run the agent" six times in ten seconds is a rate problem. A
 * ticker left running overnight is a spend problem. A model that answers with
 * nonsense is a retry problem. A block with no reports is none of those and
 * should simply cost nothing.
 *
 * The spend ceiling latches. Once crossed it stays crossed for the life of the
 * process, and no later run re-checks and slips through: a ceiling that
 * un-trips itself is not a ceiling.
 */
import { env } from '../env'
import { log } from '../log'
import { runsSince, spentUsd } from '../store'

/** How many malformed model responses a run tolerates before giving up. One
 *  retry, then stop - the same budget docs/03 section 7 gives the two pipeline
 *  calls, for the same reason: a second bad answer is a pattern, not a blip. */
export const MAX_MALFORMED = 1

/** Model calls per run. A run still going after this is looping, not thinking. */
export const MAX_TURNS = 8

let ceilingCrossed = false

/** The operator reset and the tests. Does not refund anything - `spentUsd` is
 *  computed from the run log, so clearing that clears the spend too. */
export const resetGuards = (): void => { ceilingCrossed = false }

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; outcome: 'capped' | 'disabled'; reason: string }

/**
 * Checked once, before a run starts. Never mid-run: a run that has already
 * spent money should finish and be logged rather than be abandoned halfway
 * with its actions half-applied.
 */
export const checkGuards = (): GuardVerdict => {
  const ceiling = env.spendCeilingUsd()
  const spent = spentUsd()

  if (ceilingCrossed) {
    return {
      allowed: false,
      outcome: 'disabled',
      reason: `spend ceiling of $${ceiling.toFixed(2)} was crossed; the agent is disabled until restart`,
    }
  }

  if (spent >= ceiling) {
    ceilingCrossed = true
    log.error('agent.spend_ceiling', { spent_usd: spent, ceiling_usd: ceiling })
    return {
      allowed: false,
      outcome: 'disabled',
      reason: `spend ceiling reached: $${spent.toFixed(4)} of $${ceiling.toFixed(2)}`,
    }
  }

  const perMinute = env.callsPerMinute()
  const recent = runsSince(Date.now() - 60_000)
  if (recent >= perMinute) {
    return {
      allowed: false,
      outcome: 'capped',
      reason: `${recent} runs in the last minute, cap is ${perMinute}. Try again shortly.`,
    }
  }

  return { allowed: true }
}

/** True once the ceiling has latched, for the civic page's status line. */
export const agentDisabled = (): boolean => ceilingCrossed

export type GuardStatus = {
  disabled: boolean
  spent_usd: number
  ceiling_usd: number
  runs_last_minute: number
  calls_per_minute: number
}

export const guardStatus = (): GuardStatus => ({
  disabled: ceilingCrossed,
  spent_usd: Number(spentUsd().toFixed(6)),
  ceiling_usd: env.spendCeilingUsd(),
  runs_last_minute: runsSince(Date.now() - 60_000),
  calls_per_minute: env.callsPerMinute(),
})
