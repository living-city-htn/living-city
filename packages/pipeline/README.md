# @living-city/pipeline

The two AI calls and everything deterministic around them. Pipeline-owned
(`docs/roles/pipeline.md`).

```
photo + caption
     |  Call A   OpenAI small tier, vision, temperature 0, strict schema
     v
PostAnalysis  ->  validator  ->  stored per post, incident extracted
     |
     |  aggregator   deterministic: weights, decay, baseline, trend, sufficiency
     v
SemanticState + PlanningInput
     |  Call B   OpenAI full tier, temperature 0, strict schema
     v
CommunityPlan  ->  VALIDATOR  ->  the JSON the renderer builds a block from
```

There are exactly two model calls in this package and nothing in it emits
geometry. That is the architectural rule, not a style preference: AI interprets
reality and plans visual intent, AI ends at structured JSON, and everything
geometric, procedural, rendered, scored, sold, placed or reported is
deterministic code.

## Run it

```bash
# Everything downstream of Call A, with no API key and no spend. Uses the
# hand-written analyses in packages/fixtures/data/post-analysis.mock.json.
npm --workspace @living-city/pipeline run run:all -- --offline

# The real thing. Needs OPENAI_API_KEY.
npm --workspace @living-city/pipeline run run:all

# Call A over the seed set, with the Gate 1 incident report.
npm --workspace @living-city/pipeline run run:a

# Replay a recorded Call A run through the aggregator and Call B.
npm --workspace @living-city/pipeline run run:all -- --replay=out/post-analysis.json

# Gate 0: does the provider accept the real CommunityPlan response schema?
npm --workspace @living-city/pipeline run check:schema

npm --workspace @living-city/pipeline test
```

Output lands in `packages/pipeline/out/` as JSON: `post-analysis.json`,
`plans.json` (one validated `CommunityPlan` per block), `community-state.json`
(the aggregate, the trend, the archetype signal, the input hash and the
validator log per block).

## The validator is the point

`src/call-b/validate.ts` is the safety net and is never cut. A prompt bug can
produce a clamped plan or a rejected one; it cannot produce a broken city.
Every rule in `docs/02` section 4.4 is enforced and every correction is logged:

| Failure | What happens |
|---|---|
| `community_id` mismatch | plan rejected, previous kept |
| `taxonomy_version` mismatch | plan rejected, previous kept |
| model returns `{"error": ...}` | plan rejected, previous kept |
| composition does not sum to 100 | normalised proportionally |
| composition shifted over 15 points | scaled back toward the previous plan |
| `height_profile` over `capacity.max_height_tier` | clamped |
| density or height moved more than one step | clamped to one step |
| archetype changed without 2 supporting windows and medium/high data | reverted |
| unknown enum value | dropped; required enums fall back to previous, then zoning default |
| invented landmark in `hero_asset` | dropped (the enum holds generic types only) |
| unknown top-level key (coordinates, mesh names) | stripped and logged |

Call A has its own validator (`src/call-a/validate.ts`): it forces the input
`post_id`, drops uncontrolled tags, strips handles and phone numbers out of
keywords, nulls everything on `unsafe`, refuses a `location_hint` that carries
coordinates, and reconciles a form-reported incident type with the model's
reading by keeping the model's and flagging `unclear`.

Both are covered by `test/validator.test.ts`.

## Tuning moment 4

Moment 4 is the pitch: one scripted post arrives and the demo block visibly
changes while its identity holds. The dial is in `src/env.ts`, surfaced in
`.env.example`:

- `AGG_RECENCY_HALF_LIFE_HOURS` (default 12) is the main one. Shorter means a
  fresh post outweighs the calm seed posts sooner.
- `AGG_SUFFICIENCY_MEDIUM` / `AGG_SUFFICIENCY_HIGH` set when a block has
  "enough" data. Archetype changes need medium or high, so these also decide
  how hard identity is to move.
- `AGG_BASELINE_ALPHA` (default 0.2) is how fast identity drifts. Raise it and
  blocks stop feeling stable; that is the failure mode to watch for.

Identity is slow and mood is fast by construction: archetype, height,
composition and identity tags track `baseline` and move by bounded steps, while
mood, lighting, effects, activity and decorations track `current`. An event
becomes effects, never buildings.

## Contracts and fixtures

Shapes come from `@living-city/contracts` and nothing here redefines them. The
provider response schemas in `src/call-a/schema.ts` and `src/call-b/schema.ts`
are generated from the same enum tuples, so the Zod contract and the API schema
cannot drift. Ranges and cross-field rules are not expressible in the API schema
subset and live in the validators on purpose.

Two fixtures are produced here and committed under `packages/fixtures`:

- `post-analysis.mock.json` - expected Call A output for all 22 seed posts,
  including the three seeded incidents, the two near-misses that must not
  produce one, and the prompt-injection post.
- `planning-input.mock.json` - the rich, sparse and empty Call B scenarios from
  `docs/03` section 6.

`src/taxonomy.ts` holds a fallback taxonomy built from the contracts enums,
used until 3D lands `taxonomy.v1.json`. Drop their file at
`packages/modeling/data/taxonomy.v1.json` (or set `TAXONOMY_PATH`) and it is
picked up with no code change.

## The provider

OpenAI is the single critical-path provider for both calls
(`integration/EVENT-FACTS.md` decision 3). `src/provider/openai.ts` uses
Structured Outputs with `strict: true`, so the API enforces the shape rather
than the prompt asking nicely, and passes the photo inline as a data URL.

The response schemas in `src/call-a/schema.ts` and `src/call-b/schema.ts` stay
written in the OpenAPI subset, and `toStrictSchema` in the adapter translates
them: `nullable: true` becomes a type union with `"null"`, `propertyOrdering` is
dropped, every object gets `additionalProperties: false`, and Call A's root
array is wrapped in an object and unwrapped again on the way back, because
Structured Outputs requires an object at the root. One schema source, generated
from the contracts enums, so the Zod contract and the API schema still cannot
drift.

Model defaults are the deterministic tiers (`gpt-4.1-mini` for Call A,
`gpt-4.1` for Call B), overridable with `OPENAI_MODEL_CALL_A` and
`OPENAI_MODEL_CALL_B`. The reasoning tiers are not the default on purpose: they
reject `temperature`, which docs/03 principle 7 needs at 0 for the replay set
to mean anything, and they spend the output budget on reasoning tokens.

Gemini is built (`src/provider/gemini.ts`) and reachable with
`AI_PROVIDER=gemini`, but it is the documented alternate, not a runtime
fallback. Nothing fails over automatically: an untested fallback is not a
fallback, and the stage-time fuse for an outage is the operator's preset plan
button and the fallback video.
