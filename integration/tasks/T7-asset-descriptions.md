# T7: Asset descriptions in the taxonomy

Status: proposed, not agreed
Last updated: 2026-09-19
Decides: whether every asset in `taxonomy.v1.json` carries a short description
and its aliases, so Call B is not guessing what a tag looks like and the
enum-to-asset aliasing is machine-readable.

Owner: 3D produces it. Pipeline approves the schema change, because
`packages/contracts` is theirs.
Wave: Gate 0, alongside the asset manifest. Retrofitting after Stage 2 means
re-tuning prompts against a changed input.

## Assumptions

1. The asset manifest has not been written yet. If it has, this becomes a patch
   to an existing file rather than a shape decision.
2. Call B runs per community per tick, not per post, so a few hundred extra
   tokens of prompt prefix is affordable and cache-friendly.

## The gap

`docs/03` section 5.4 defines `AssetTaxonomy` as version, enums and
zoning_defaults. The enums are bare strings. Three problems follow.

| Problem | Consequence |
|---|---|
| `kiosks`, `market_stalls` and `food_trucks` are not distinguishable from their names alone | The model picks between them inconsistently across runs, which works against the determinism requirement in docs/03 section 8 item 7 |
| Aliasing is real but invisible | docs/04 section 3 caps visually distinct archetypes at 4 or 5 and says the rest "alias to the nearest one in the asset manifest". Nothing in the data says which aliases to which, so it lives in one person's head |
| A tag with no asset behind it is only found by looking | A valid plan renders nothing and nobody knows why |

## The change

Add an optional `entries` array to `AssetTaxonomy`.

```json
{
  "tag": "market_stalls",
  "label": "Market stalls",
  "description": "Rows of covered vendor tables. Daytime, commercial, busy. Use for markets and street fairs, not nightlife.",
  "aliases": ["kiosks"]
}
```

Rules:

1. Every tag in every enum has exactly one entry, or is named in another
   entry's `aliases`.
2. `description` is one sentence, under 200 characters: what it looks like,
   when to use it, when not to.
3. 3D may add tags and bump `version`. 3D may not rename or remove a tag that
   a released taxonomy version already contained.
4. `entries` is optional in the schema, so the taxonomy validates with or
   without it and nothing breaks while this is undecided.

## Already done

`packages/contracts/src/taxonomy.ts` carries `taxonomyEntry` and the optional
`entries` field, marked as an open proposal. No code depends on it yet.

## Acceptance

A test that fails if any enum value is neither an entry nor an alias of one.
That test is the whole integration surface between Pipeline and 3D, and it is
the answer to "how do we know a valid plan will actually render".

## If this is never built

Call B keeps working on bare enum names. The cost is inconsistent decoration
choices between runs and a manual check that every tag has an asset. Nothing in
the demo script fails. This is a quality and determinism improvement, not a
blocker, and it is allowed to start at Gate 0 only because it is cheapest there.
