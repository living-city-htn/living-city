# Aesthetic Waterloo City Scene — task checklist

- [x] Task 1 — Frame the selected community (`scene/camera-focus.ts`, 1456124)
- [x] Task 2 — Make planning and festival states unmistakable (`scene/visual-state.ts`, 34c58c5; E7 fireworks bf8fcf6)
- [ ] Checkpoint — Gate 1 / Gate 2 visual path (needs a phone rehearsal; not verifiable in code)
- [ ] Task 3 — Verify the visual performance budget
  - [x] Asset loading falls back to procedural geometry, never a blank block (`SceneAsset` `fallback`)
  - [ ] Measure ≥30 fps on the demo phone and laptop (needs the physical devices)
- [x] Task 4 — Render City Hall from the existing civic asset (`scene/civic-hall.ts`)
- [x] Task 5 — Add the selected-City-Hall tornado drill (237ad4b; control moved to the operator panel in a383093)
- [x] Follow-up — Add a clearly labelled tornado-drill evidence image
  (`public/seed/drill-simulation-city-hall.svg` on drill post `p-114`; an illustration stamped "SIMULATION", not a generated photo)
- [x] Assign Pipeline — fix fixture-test path (`fixtures.test.ts` resolves via `import.meta.url`)
- [x] Assign Pipeline + reviewer — update stale contracts city fixture check (`check.cjs` reads Map's `city.json`)
