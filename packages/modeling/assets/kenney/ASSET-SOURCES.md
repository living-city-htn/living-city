# Kenney CC0 asset subset

This is the complete Gate 0 subset: eight building models, twelve
decoration/vegetation models, and two people. The caps are enforced by
`test/assets.test.ts`.

All sources are by Kenney and CC0-1.0. The original pack notices are summarized
in [LICENSE-KENNEY-CC0.txt](LICENSE-KENNEY-CC0.txt).

| Directory | Pack and version | Selected source models |
|---|---|---|
| `buildings/` | City Kit Suburban 2.0; City Kit Commercial 2.1 | `building-type-a` through `building-type-d`; `low-detail-building-e` through `low-detail-building-h` |
| `decor/` | City Kit Suburban 2.0; City Kit Roads 2.1; City Kit Commercial 2.1 | `tree-large`, `tree-small`, `planter`, `fence-low`, `path-stones-long`, `construction-barrier`, `construction-cone`, `construction-fence`, `light-square`, `road-sign-street`, `traffic-light`, `detail-parasol-a` |
| `people/` | Blocky Characters 2.0 | `character-a`, `character-b` |

Each selected source GLB was converted with `gltf-transform draco INPUT OUTPUT
--method edgebreaker`. The generated GLBs embed their source texture and require
`KHR_draco_mesh_compression`; they do not fetch assets at runtime. The source
archives are intentionally not committed.
