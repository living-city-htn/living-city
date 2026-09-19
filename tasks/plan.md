# Implementation Plan: Aesthetic Waterloo City Scene

## Overview

Make the public city read as a polished, low-poly Waterloo miniature: a calm
isometric overview becomes a focused community story when a person taps a
block, and a festival post makes that one block visibly come alive. The two
reference screenshots guide camera composition, depth, roads, trees, soft
shadows, and selection focus—not the engineering dashboard or its visual
brand.

## Scope and constraints

- A judge will see and touch this during the demo, so it belongs on the demo
  path.
- Preserve the existing `CityScene` prop and event contract. The scene renders
  app state; it does not own posts or plans.
- Use the existing asset library, palettes, three-effect limit, and clipped
  grid. Do not add a GIS building-footprint layer or a faithful replica of a
  Waterloo building.
- A selected community must frame in camera, show its existing post panel, and
  return to the full-city composition when deselected.
- Hero landmarks are Stage 4 work only, after Gate 3. They may use an existing
  asset alias; adding a new asset requires checking the fixed asset cap.

## Design decisions

- The scene keeps the project's white, quiet interface chrome. Colour belongs
  in the miniature: muted base blocks, a blue planning state, and warm
  amber/pink event accents.
- Selection is communicated by a smooth camera move plus a small slab lift.
  The motion must respect reduced-motion preferences and never fight a drag or
  pinch gesture.
- A post does not instantly rewrite a block. It first receives the existing
  planning state; after the accepted plan arrives, only that community gets
  warm light, stage/string-light props, crowd, and up to three effects.

## Task list

### Phase 1 — selected-community journey

#### Task 1: Frame the selected community

**Description:** Add a deterministic camera-focus controller to the 3D scene.
It moves OrbitControls' target and camera to the selected block after a tap,
then restores the all-city composition after deselection.

**Acceptance criteria:**

- [ ] A tap/click centers and zooms the selected community without changing
  the public plan or personal placements.
- [ ] Empty-ground deselection restores the full city; pinch and orbit stay
  usable after the animation.
- [ ] The transition respects reduced motion and does not rerun while dragging.

**Verification:**

- [ ] Focused unit tests cover target calculation and reset behavior.
- [ ] `corepack pnpm --filter @living-city/web test` and typecheck pass.
- [ ] Verify at 390px and desktop that the selected card and block are visible.

**Dependencies:** None.  
**Files likely touched:** `apps/web/scene/CityScene.tsx`, a focused camera
helper and test beside it.  
**Estimated scope:** Medium (3 files).

#### Task 2: Make planning and festival states unmistakable

**Description:** Refine existing scene state styling so a new post has a
readable blue planning signal and the resulting festival state is visibly warm
and active from across the room. Reuse existing stage, string lights, crowd,
and the three allowed effects.

**Acceptance criteria:**

- [ ] Planning is visually distinct from both calm and selected states.
- [ ] The preset festival plan differs from its calm version through warm
  light, event props, crowd, and animated effects—not changed buildings.
- [ ] No new effects, asset categories, or plan fields are introduced.

**Verification:**

- [ ] Existing asset-layout and modeling tests remain green.
- [ ] Capture calm, planning, and festival screenshots at phone width.
- [ ] A rehearsal viewer can identify the changed block without narration.

**Dependencies:** Task 1.  
**Files likely touched:** `apps/web/scene/CityScene.tsx`, a focused visual
state test if the logic is extracted.  
**Estimated scope:** Small to medium (1–3 files).

### Checkpoint — Gate 1 / Gate 2 visual path

- [ ] The city keeps its whole-city overview at rest.
- [ ] A selected community frames cleanly and its existing panel shows recent
  posts, mood, and reasons.
- [ ] A calm-to-festival update is obvious from across the room.
- [ ] A phone test confirms moments 1, 2, and 4 work without a desktop-only
  interaction.

### Phase 2 — readiness and protection

#### Task 3: Verify the visual performance budget

**Description:** Measure the selected/festival scene on the demo phone and
laptop. Activate reduced detail only when measurements show it is needed.

**Acceptance criteria:**

- [ ] Default overview, selection focus, and festival update retain at least
  30 fps on the demo phone.
- [ ] Asset loading has a procedural fallback and never leaves a blank block.

**Verification:**

- [ ] Record a performance trace and console check on the deployed preview.
- [ ] Run the full web build before rehearsal.

**Dependencies:** Tasks 1–2.  
**Files likely touched:** none unless measurement shows a real bottleneck.  
**Estimated scope:** Small (verification-first).

### Phase 3 — Stage 4 only, after Gate 3

#### Task 4: Render one existing hero landmark on a campus plaza

**Description:** Honor an approved plan's `hero_asset` using an existing
asset alias, placed on the deterministic plaza. The university block becomes
recognizable without pretending to be an accurate building survey.

**Acceptance criteria:**

- [ ] A `university_hall` hero appears only for plans that request it.
- [ ] It is placed deterministically on the plaza and does not overlap a
  personal decoration slot.
- [ ] It uses the existing asset cap and stays consistent with the low-poly
  miniature style.

**Verification:**

- [ ] Add a focused placement/render mapping test.
- [ ] Run web and modeling tests, typechecks, and a phone visual check.

**Dependencies:** Gate 3 passed; Tasks 1–3.  
**Files likely touched:** `apps/web/scene/CityScene.tsx`,
`apps/web/scene/asset-layout.ts`, its test.  
**Estimated scope:** Medium (3 files).

## External blockers to assign

- Pipeline must correct its fixture test's repository-relative path before its
  workspace test command can pass.
- Pipeline plus a second approver must update the contracts check, which still
  references the removed `city.fallback.json`. The 3D owner must not edit
  `packages/contracts` alone.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Camera animation fights touch gestures | Cancel focus animation on control start; preserve OrbitControls interaction. |
| Festival change is subtle | Rehearse calm versus preset festival from the back of the room. |
| "Real building" becomes GIS scope creep | Use a recognisable low-poly landmark alias, not an accurate footprint or replica. |
| Mobile frame rate drops | Measure before optimizing; reduce instance counts only if needed. |

## Approval checkpoint

Implementation begins with Tasks 1–2 only. Task 4 remains explicitly deferred
until Gate 3. Record these tasks on the team's GitHub Projects board when it
is available.
