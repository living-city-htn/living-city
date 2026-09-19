# @living-city/modeling

Module 4: asset library manifest, taxonomy generator, deterministic placement rules.

**Owner: 3D**

Per `docs/05-team-workflow.md` section 2, only the owner edits this package directly.
Anyone else changes it through a PR the owner reviews.

## Gate 0 data

`data/asset-manifest.v1.json` is the 3D-owned mapping from the visual taxonomy
to assets or deterministic aliases. The selected CC0, Draco-compressed glTF
models live in `assets/kenney`; its provenance and license are committed beside
them. The current scene keeps using its deterministic primitive fallback until
its Stage 1 asset-loader work begins. The manifest also defines the six capped
shop items. `data/taxonomy.v1.json` is the versioned prompt input Pipeline loads
from this package; it contains controlled vocabulary and zoning defaults, never
geometry.

`data/plans.mock.json` provides five contrasting valid plans and the festival
plan for fixture development. It is deliberately not the shared city's plan
store. Product continues to use its fixture fallback until Pipeline's Stage 2
routes are ready.
