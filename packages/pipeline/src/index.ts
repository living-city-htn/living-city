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
 * Nothing in this package emits geometry. There are exactly two model calls on
 * the path from a post to a block: Call A and Call B. The voice call in
 * `voice/` is a third, and it is fenced: it runs only for a post that carries a
 * recording, it is never reachable from `getProvider()`, it produces a
 * transcript rather than an interpretation, and a post whose voice call fails
 * is analysed from its caption exactly as it would have been without one.
 */

export * from './env'
export * from './log'
export * from './hash'
export * from './time-context'
export * from './taxonomy'
export * from './provider'
export * from './call-a'
export * from './voice'
export * from './aggregate'
export * from './call-b'
export * from './cycle'
