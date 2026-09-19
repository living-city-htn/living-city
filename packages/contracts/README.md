# @living-city/contracts

TYPES ONLY. Every shape in `docs/02` section 7 and `docs/03`, as Zod schemas
with inferred types.

**Owner: Pipeline.** Changes need the Pipeline owner plus one other before
Gate 2, and all four after it (`AGENTS.md`).

> **This is a draft.** It was written by the Product owner at Gate 0 because no
> Pipeline owner had arrived yet, so that the other packages had something to
> compile against. Whoever takes Pipeline owns it from that moment and should
> read it against `docs/03` and change anything that is wrong. It is a starting
> point, not a decision.

## Layout

| File | Covers |
|---|---|
| `enums.ts` | Every controlled vocabulary in docs/03 section 5, as const tuples plus Zod enums |
| `geo.ts` | `CommunityGeo`, the `->B` planning subset, decoration slots |
| `call-a.ts` | `PostInput`, `PostAnalysis`, the incident block, batching |
| `call-b.ts` | `SemanticState`, `PlanningInput`, `CommunityPlan`, the error return |
| `taxonomy.ts` | `AssetTaxonomy` (3D generates it, Call B consumes it) |
| `db.ts` | Stored shapes from docs/02 section 7, plus the points values |

## What the schemas already enforce

Beyond shape: `building_composition` sums to exactly 100, `identity_tags` is
2 to 4, decorations cap at 8, effects at 3, `summary` at 200 characters,
`severity` is 0 when and only when `incident.type` is `none`, and an `unsafe`
post must carry `about_location: 0`.

`toPlanningGeo()` produces the `->B` subset, so polygons, centroid and bbox
cannot reach a prompt by accident.

What they do **not** enforce, because it needs the previous plan or the
capacity as context, and belongs in Pipeline's validator (docs/02 section 4.4):
height against `capacity.max_height_tier`, the 15-point composition delta, the
archetype-change rule, and `community_id` echo.

## Tests

```bash
pnpm test
```

Compiles the package, then parses every fixture in `packages/fixtures` against
these schemas and asserts that a set of deliberately broken values is rejected.
