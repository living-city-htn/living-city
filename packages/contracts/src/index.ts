/**
 * @living-city/contracts - TYPES ONLY.
 *
 * Every shape in docs/02 section 7 and docs/03, as Zod schemas with inferred
 * types. This package is the seam: if it compiles, everyone is speaking the
 * same language (docs/05 section 2).
 *
 * DRAFT, written by the Product owner at Gate 0 because no Pipeline owner had
 * arrived yet. Pipeline owns this package. Whoever takes that role should read
 * it against docs/03 and change whatever is wrong - it is a starting point, not
 * a decision. After that, AGENTS.md applies: changes need the Pipeline owner
 * plus one other before Gate 2, and all four after it.
 */
export * from './enums'
export * from './geo'
export * from './call-a'
export * from './call-b'
export * from './taxonomy'
export * from './db'
