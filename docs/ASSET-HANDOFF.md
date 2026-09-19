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
