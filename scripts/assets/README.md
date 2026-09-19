# Rebuilding the Living City assets

The runtime library is **29 self-contained GLBs**: 12 buildings, five plants/rocks, two outdoor furniture items, two street details, six shop decorations and two event assets. It includes no new shop products. Water is scene geometry fitted to reserved terrain, not a square imported tile.

Use Python 3 with `numpy` and `Pillow`. With the six official Kenney archives already extracted under a directory:

```sh
python3 scripts/assets/build_library.py --packs /tmp/living-city-packs
```

Or explicitly request downloading the pinned public CC0 packs first:

```sh
python3 scripts/assets/build_library.py --download --packs /tmp/living-city-packs
```

`PACKS` pins the six official download URLs; `SELECTION` identifies the exact source files. The manifest records original-model SHA-256 hashes and generated-model SHA-256 hashes. Rebuilding from the same packs and Python dependencies is deterministic. Only curated normalized GLBs ship; the full downloaded archives stay outside the repository.

## Geometry and materials

- Y up, centered X/Z pivot on ground Y=0; longest horizontal edge exactly one unit. `footprint` and `height` record actual normalized bounds.
- Imported hierarchy transforms baked into vertices. Normals transformed correctly, hard edges retained, identical full vertices welded.
- Color-map samples and source material colors baked into **linear** vertex colors, slightly desaturated for a restrained palette. GLBs have no textures or external file references.
- One mesh, one primitive and one opaque rough material per model, allowing the scene to instance shared geometry/material.
- Original campus, civic, shop and event models are defined as reproducible geometry in the same script. Models are shipped as GLB rather than regenerated during rendering.
- `paletteSlots` names the uniform tint material; per-face detail remains in vertex colors. Do not remove vertex colors when applying a palette tint.

## Attribution and limitations

Kenney packs are CC0 1.0; unchanged upstream licenses are under `apps/web/public/assets/city/licenses/`. Each imported entry records its exact official pack URL, archive URL and source filename. Original assets are project-authored and marked `original`, not incorrectly attributed to Kenney.

Contract aliases in `packages/modeling/src/assets.ts` deliberately reuse the nearest existing model for non-demo taxonomy values (for example, civic hall for concert hall). These are compatibility fallbacks, not claims that distinct stadium, Ferris wheel or sports-court models have been created. The six shop item tags each resolve to their own distinct actual model. Backend prices, taxonomy and saved placement identifiers are untouched.

The street sign from the roads pack carries generic iconography; imported assets do not assert exact Waterloo architecture or real street names. City roads and water stay controlled by scene placement.
