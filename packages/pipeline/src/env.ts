/**
 * Every knob the pipeline reads from the environment, in one place.
 *
 * The tuning constants at the bottom are moment 4's dial (docs/04 section 2):
 * they decide how few posts it takes for the demo block to visibly change.
 * Keep them here, not scattered through the aggregator, so tuning at the venue
 * is one file and one redeploy.
 */

const str = (name: string, fallback: string) => process.env[name] ?? fallback
const num = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const env = {
  /** Required for any real call. Absent means the pipeline can only replay. */
  geminiApiKey: () => process.env.GEMINI_API_KEY ?? '',

  /**
   * Call A is high volume and short: Flash tier. Call B runs rarely and needs
   * the identity-versus-spike judgement: Pro tier, or Flash if Pro latency
   * hurts. docs/03 section 9. Both are overridable without a code change
   * because model ids move faster than hackathons.
   */
  modelCallA: () => str('GEMINI_MODEL_CALL_A', 'gemini-2.5-flash'),
  modelCallB: () => str('GEMINI_MODEL_CALL_B', 'gemini-2.5-pro'),

  /** docs/03 section 9: about 350 tokens for Call A, about 600 for Call B. */
  maxTokensCallA: () => num('CALL_A_MAX_TOKENS', 1200),
  maxTokensCallB: () => num('CALL_B_MAX_TOKENS', 2400),

  requestTimeoutMs: () => num('AI_TIMEOUT_MS', 20_000),
  /** One retry, per docs/03 section 7. Not a loop. */
  maxAttempts: () => num('AI_MAX_ATTEMPTS', 2),
  /** Call A runs inline in the post handler; this caps simultaneous flights. */
  callAConcurrency: () => num('CALL_A_CONCURRENCY', 4),

  taxonomyPath: () => process.env.TAXONOMY_PATH ?? null,
  cityId: () => str('CITY_ID', 'kw'),
  /** The city's wall clock, used to build time_context. */
  cityTimezone: () => str('CITY_TIMEZONE', 'America/Toronto'),

  // ---- Aggregator tuning. docs/02 section 4.3, docs/04 moment 4. ----------

  /**
   * Recency decay half-life. Short on purpose: a block with four calm seed
   * posts must tip when one loud post arrives on stage. Raise it for a real
   * deployment where windows are days, not minutes.
   */
  recencyHalfLifeHours: () => num('AGG_RECENCY_HALF_LIFE_HOURS', 12),
  /** Engagement is a bonus, never a gate: weight is 1 at zero engagement. */
  engagementFactor: () => num('AGG_ENGAGEMENT_FACTOR', 0.5),
  /** Flagged-but-usable posts (spam, advertising, instruction_like) count half. */
  flaggedWeight: () => num('AGG_FLAGGED_WEIGHT', 0.5),
  /** Long-term profile EMA. Low alpha = identity moves slowly. */
  baselineAlpha: () => num('AGG_BASELINE_ALPHA', 0.2),
  /** data_sufficiency cutoffs, in effective (weighted) post count. */
  sufficiencyMedium: () => num('AGG_SUFFICIENCY_MEDIUM', 6),
  sufficiencyHigh: () => num('AGG_SUFFICIENCY_HIGH', 30),
  /** Below this, a window is `low` however many posts it holds. */
  sufficiencyMinAuthors: () => num('AGG_SUFFICIENCY_MIN_AUTHORS', 3),
} as const
