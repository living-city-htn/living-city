/**
 * @living-city/pipeline - the two AI calls and everything deterministic around
 * them.
 *
 * The shape of the weekend, in one place:
 *
 *   photo + caption
 *        |  Call A (Gemini Flash, vision, temperature 0, response schema)
 *        v
 *   PostAnalysis  ->  validator  ->  stored per post, incident extracted
 *        |
 *        |  aggregator (deterministic: weights, decay, baseline, trend)
 *        v
 *   SemanticState + PlanningInput
 *        |  Call B (Gemini Pro, temperature 0, response schema)
 *        v
 *   CommunityPlan  ->  VALIDATOR  ->  the JSON the renderer builds a block from
 *
 * The rule that shapes all of it (docs/README.md): AI interprets reality and
 * plans visual intent, AI ends at structured JSON, and everything geometric,
 * procedural, rendered, scored, sold, placed or reported is deterministic code.
 * Nothing in this package emits geometry, and there are exactly two model calls
 * in it.
 */

export * from './env'
export * from './log'
export * from './hash'
export * from './time-context'
export * from './taxonomy'
export * from './provider'
export * from './call-a'
export * from './aggregate'
export * from './call-b'
export * from './cycle'
