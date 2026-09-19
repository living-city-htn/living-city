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

/**
 * Which adapter `getProvider()` builds. OpenAI is the single critical-path
 * provider (`integration/EVENT-FACTS.md` decision 3); `AI_PROVIDER=gemini`
 * switches to the documented alternate without a code change.
 */
const providerName = (): 'openai' | 'gemini' =>
  str('AI_PROVIDER', 'openai') === 'gemini' ? 'gemini' : 'openai'

export const env = {
  provider: providerName,

  /** Required for any real call. Absent means the pipeline can only replay. */
  openaiApiKey: () => process.env.OPENAI_API_KEY ?? '',
  /** Overridable for a proxy or a gateway; no trailing slash. */
  openaiBaseUrl: () => str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
  /** The alternate provider's key. Only read when AI_PROVIDER=gemini. */
  geminiApiKey: () => process.env.GEMINI_API_KEY ?? '',

  /**
   * Huawei OMNI, the voice perception step (T3). Never read by Call A or Call
   * B: `getProvider()` cannot return this adapter, `voice/index.ts` builds it
   * directly. Absent key means voice posts degrade to text-only analysis, which
   * is a supported state and not an error.
   */
  omniApiKey: () => process.env.OMNI_API_KEY ?? '',
  omniBaseUrl: () => str('OMNI_BASE_URL', 'https://api.huaweicloud.com/v1').replace(/\/$/, ''),
  omniModel: () => str('OMNI_MODEL', 'omni-multimodal'),
  /**
   * Shorter than Call A's on purpose. A voice post waits for OMNI and then for
   * Call A, so this timeout is added latency a judge stands through. Better to
   * lose the transcript than the room.
   */
  omniTimeoutMs: () => num('OMNI_TIMEOUT_MS', 8000),
  /** One retry, then give up. docs/08 section 5. */
  omniMaxAttempts: () => num('OMNI_MAX_ATTEMPTS', 2),
  /**
   * Answer the voice call from canned fixtures instead of the network. Read
   * only when no OMNI key is set, so it cannot shadow a real call by accident.
   */
  voiceFixtures: () => process.env.VOICE_FIXTURES === '1' && !process.env.OMNI_API_KEY,

  /**
   * Call A is high volume and short: the small tier. Call B runs rarely and
   * needs the identity-versus-spike judgement: the full tier. docs/03 section
   * 9. Both are overridable without a code change because model ids move
   * faster than hackathons.
   *
   * The defaults are deterministic tiers rather than reasoning tiers on
   * purpose: docs/03 principle 7 wants temperature 0 and a replay set that
   * means something, and the reasoning tiers reject temperature and spend the
   * output budget on reasoning tokens.
   */
  modelCallA: () => providerName() === 'gemini'
    ? str('GEMINI_MODEL_CALL_A', 'gemini-2.5-flash')
    : str('OPENAI_MODEL_CALL_A', 'gpt-4.1-mini'),
  modelCallB: () => providerName() === 'gemini'
    ? str('GEMINI_MODEL_CALL_B', 'gemini-2.5-pro')
    : str('OPENAI_MODEL_CALL_B', 'gpt-4.1'),

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
