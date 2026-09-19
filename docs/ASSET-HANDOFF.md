# City asset library handoff

Bryan (Product) authorized taking over the 3D asset work on 2026-09-19.
The approved direction is restrained miniature architecture with muted colors,
white space around the contained city, and gesture zoom. The older saturated
game styling in the original planning documents is superseded by this decision.

## Delivery

1. `product/asset-library`: curated licensed GLBs, reproducible generation,
   manifest, validation, and `/assets` preview gallery.
2. `product/asset-scene`: scene integration and matching shop imagery. Preserve
   the event work from PR #29; do not replace it with the older box-only scene.

The user merges both PRs. Production deployment follows the merge. No manual
production deployment is part of this work. Claude's session remains available.

## Compatibility

- Keep the existing CityScene input and callback contract.
- Keep the six existing shop tags and prices. No API or contract changes.
- Use public plans for public geometry and personal placements only in My City.
- Keep deterministic placement, community assignment safeguards, and draft state.
- The approved asset list includes chairs, street details, and terrain beyond the
  old 15-prop guideline; these are visual assets, not additional shop products.

## Baseline verification

At main `4502dd0`, the web suite passes 54 tests, modeling passes 9 tests,
and workspace type checking passes. The root `pnpm test` command fails before
reaching these suites because `packages/contracts/scripts/check.cjs` still reads
the deleted `packages/fixtures/data/city.fallback.json`. The live fixture module
now reads the processed Waterloo city. This pre-existing contract-test issue
is not a GLB import failure; do not restore the retired city fixture to mask it.

## Release checks

Record the final model count, payload size, screenshots, test results, and any
device-only verification gaps here before opening the integration PR.

## Asset-library results (PR 1)

- 29 models: 19 curated Kenney imports and 10 project-authored models.
- GLB payload: 1,081,912 bytes total; 19,373 triangles across the whole library.
- Every model has one mesh/material, baked vertex colors, no external textures,
  a centered ground pivot, and a maximum horizontal dimension of one city unit.
- The manifest and public JSON copy record bounds, payload bytes, hashes,
  exact source files, and licenses. Non-demo taxonomy approximations are documented.
- 29 PNG previews were rendered from those GLBs (about 388 KiB on disk).
- Modeling: 40 tests pass, including GLB parsing, indices, bounds, hashes,
  license presence, tag coverage, and six distinct shop models. Type checks pass.
- `/assets` is a review gallery, with category selection, keyboard/touch orbit,
  normalized scale grid, provenance and downloads. It adds no main-navigation tab.
- Screenshot: [desktop gallery](asset-verification/gallery-1440.png).

To regenerate models, see `scripts/assets/README.md`. To regenerate previews,
start the local app on port 3100 and run `node apps/web/scripts/capture-assets.mjs`.
The capture script requires Chrome and uses the pinned Playwright dependency.

## Scene-integration results (PR 2)

Library PR: https://github.com/living-city-htn/living-city/pull/31.
The integration branch includes the existing event work from PR #29 and camera /
shared tab-visibility work from PR #30 at `ef35b37`; FrameCity is preserved exactly.
Those changes are inherited commits, not replacements for Claude's work. Both new
PRs target main so the user can merge the library first, then the integrated scene.

New scene work batches repeated GLBs per model/block and shares cached geometry
and materials. Instance buffers are disposed when batches are replaced. The
procedural objects remain visible while loading and after failed asset requests.
Apartments, offices and low-rise homes use distinct variants without flattening
roofs. Vegetation follows plan types. All six shop decorations resolve to distinct
models. Event plazas display multiple planned props together. Reduced motion
freezes crowds/effects, while direct manipulation stays available.

Ponds are deterministic reserved cells only in water-adjacent communities. Their
shoreline fits inside the cell, replacing the cell's building/vegetation. All
possible decoration slots are excluded when choosing water cells in both modes;
private inventory cannot change public geometry. These are illustrative ponds,
not newly claimed geographic lake boundaries.

Final local production-build verification:

- Web: 57 tests pass. Modeling: 40 tests pass. Production build and type checks pass.
- City, Shop, My City and gallery checked at 320, 390, 768, 1024 and 1440 pixels;
  no horizontal overflow. Inactive screens are inert and do not retain focus.
- All six products purchased, selected via “Decorate My City”, placed, verified
  through the local API, then returned to inventory. Local fixture posts supplied
  additional points through the existing server-authoritative route.
- Purchase failure, missing gallery models, and failed scene model requests tested.
  The gallery reports failure and the city keeps its procedural fallback.
- Keyboard gallery controls and a simulated two-finger pinch passed.
- Desktop animation-frame sample: about 60 fps over 2.5 seconds. This is NOT a
  physical-phone GPU benchmark; the 30 fps phone target remains unverified.
- Independent review found an instance-buffer leak; fixed and re-reviewed clean.
- Root `pnpm test` still has the baseline retired-fixture issue described above.

Screenshots: [city desktop](asset-verification/city-1440.png),
[city phone](asset-verification/city-390.png),
[pinch zoom](asset-verification/city-pinched-390.png),
[shop phone](asset-verification/shop-390.png),
[placed bench](asset-verification/placed-bench.png).
Machine-readable results: `docs/asset-verification/report.json` and `gestures.json`.

### Reproduce the rehearsal

Build and run with `USE_FIXTURES=1`, `DATABASE_URL=` and `POSTGRES_URL=` to use
local-only fixture state. Use the production build for the journey: development
route compilation can reset the temporary in-memory store.

```
USE_FIXTURES=1 DATABASE_URL= POSTGRES_URL= pnpm --filter @living-city/web build
USE_FIXTURES=1 DATABASE_URL= POSTGRES_URL= pnpm --filter @living-city/web start --port 3100
ASSET_TEST_FIXTURES=1 node apps/web/scripts/verify-assets.mjs
node apps/web/scripts/verify-city-gestures.mjs
```

The rehearsal only accepts localhost URLs and explicitly resets local fixture
state. It never needs production credentials. Browser output is written under
`/tmp/living-city-asset-verification`; Chrome must be installed.
