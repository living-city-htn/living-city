# System Architecture and Interface Contracts

Status: pre-hackathon planning draft, revision 2
Last updated: 2026-09-16

Revision 2 keeps the four-module city pipeline unchanged and adds two deterministic services around it: the Game layer (interactions, points, shop, inventory, personal decorations) and the Civic layer (incidents and the government page; trends and weather are product scope described in the PRD and not built this weekend). Neither adds an AI call.

## 1. Architectural principle

AI interprets reality and plans visual intent. AI ends at structured JSON. Traditional code handles geography, geometry, asset placement, procedural generation, and rendering.

There are exactly two AI calls in the system. Everything else is deterministic. The Game and Civic layers consume the outputs of those calls and never add calls of their own.

## 2. Module overview

```
                ┌───────────────┐
                │ 1. Map Module │  real polygons → block shapes, adjacency, metadata
                └──────┬────────┘
                       │ CommunityGeo[]
                       ▼
  Post ──▶ ┌──────────────────────┐   ┌──────────────┐   ┌───────────────────────┐
           │ 2. Post Processing   │──▶│  Aggregator  │──▶│ 3. Community Planning │
           │  (assign + AI Call A)│   │ (determin.)  │   │      (AI Call B)      │
           └──────────────────────┘   └──────────────┘   └──────────┬────────────┘
                                                                    │ CommunityPlan (validated)
                                                                    ▼
                                                         ┌───────────────────────┐
                                                         │ 4. Procedural Modeling│
                                                         │  + Renderer           │
                                                         └───────────────────────┘
```

### 2.1 Surrounding layers

```
  Users ──▶ Game layer (deterministic) ──▶ points, shop, inventory, personal placements
               │ likes, comments (engagement)
               ▼
           Aggregator                                   Civic layer (deterministic)
                                                         └─ incidents from PostAnalysis.incident
                                                            (trends, weather: product scope, not this weekend)
  Renderer draws: public layer (plans) + personal layer (own placements); overlays are product scope
```

## 3. Data flow

1. Map Module runs once per city at startup or build time. Produces `CommunityGeo[]` and a block layout.
2. A post arrives. Module 2 resolves `community_id` by point-in-polygon, enriches time context, and sends the post to AI Call A. The result is stored as `PostAnalysis`.
3. The Aggregator maintains per-community `SemanticState` for the current window and a long-term baseline. It recomputes on each new analysis.
4. On a schedule, on demand, or when a community's input hash changes, Module 3 builds `PlanningInput` and calls AI Call B. The Validator checks the result and stores an accepted `CommunityPlan`.
5. Module 4 rebuilds any block whose accepted plan changed and the renderer updates the scene.
6. In parallel, the Game layer credits points for the post and for any likes or comments, and serves the shop and inventory. The renderer draws the viewer's own placements on top of the public block.
7. In parallel, the Civic layer files an incident record if the analysis produced one. Trend history, weather, and incident markers are product scope described in the PRD and not built this weekend.

## 4. Module responsibilities and boundaries

### 4.1 Map Module

Owns: polygon retrieval, simplification, adjacency, layout, land-use hints, capacity.

Two layers with different sources, and they never mix:

- **Visual layer (hand-drawn).** 12 to 20 central blocks drawn by hand in a GeoJSON editor over the real map as simplified 4 to 8 vertex shapes, with ids, names, adjacency, centroid, area, relative position, capacity, and decoration slots. Committed as processed data. This is the city the renderer draws. Its job is to read as Kitchener-Waterloo at a glance and to make blocks legible, not to be accurate.
- **Assignment layer (official).** One official planning-area GeoJSON per city, unmodified. Point-in-polygon over these decides a post's official area. A mapping table links each official area to a hand-drawn block id. If the area has no drawn block, or the point is outside every polygon, the post is assigned to the nearest drawn block by centroid, so every post is visible somewhere. The official area id is kept on the post for later use.

Processing this weekend is limited to loading the official files and running point-in-polygon. Merging, snapping, and automatic simplification are product scope for later cities.

Output: `CommunityGeo[]` (see prompt spec section 2.1) plus a `BlockLayout` for the renderer, both from the hand-drawn file, and an assignment function over the official file.

Never: calls AI, changes after startup during the demo, uses the hand-drawn polygons for assignment.

### 4.2 Post Processing Module

Owns: post intake, community assignment, time enrichment, AI Call A, storage of `PostAnalysis`.

Processing:
- Validate post shape. Truncate text to 1,000 characters.
- Assign community by point-in-polygon against `polygon_real`. Null if outside all.
- Build `time_context` from timestamp and city timezone.
- Call A runs inline in the post handler, one post per request, behind a concurrency guard sized to the provider's rate. Batching is product scope for real volume; Vercel has no long-running worker to drain a queue. Validate output against the schema and taxonomy.
- Persist `PostAnalysis` linked to the post. Until it exists, the post is `pending` and invisible in public feeds and panels.
- If the analysis carries `unsafe`, or the provider refuses the content, set `hidden = true` with reason `auto`.
- Per-user rate limit: one post per 30 seconds. Users are device-bound: a cookie identifies the device and a `User` row is created on first request. No sign-in this weekend.

Never: assigns community via AI, generates 3D content, reads engagement into the prompt.

### 4.3 Aggregator (part of Module 2's pipeline, deterministic)

Owns: per-community `SemanticState`, baseline, trend, data sufficiency, change-support counter.

Rules:
- Hidden posts and pending posts are excluded before anything else.
- Weight: `1 × confidence/100 × about_location/100 × (1 + 0.5 × log(1 + engagement)) × recency_decay`. The base weight is 1, so a brand-new post with no interactions has full weight. Engagement is a bonus, never a gate. If engagement weighting is cut, the factor becomes exactly 1.
- Exclude posts flagged `unsafe`. Halve weight for `instruction_like`, `spam`, `advertising`.
- Null dimensions are excluded from means, not counted as zero.
- Baseline is an exponential moving average over windows with a slow alpha (for example 0.2).
- `data_sufficiency`: none (0 posts), low (1 to 5 or fewer than 3 authors), medium (6 to 30), high (over 30). Tune during the hackathon.
- `consecutive_windows_supporting_change`: number of consecutive windows where the dominant archetype signal differs from the current plan's archetype.

### 4.4 Community Planning Module

Owns: `PlanningInput` assembly, AI Call B, the Validator, plan storage, planning cadence.

Validator responsibilities (hard rules, applied after every call):
- Schema and enum validation against the versioned taxonomy. Unknown values dropped.
- `community_id` must match. Otherwise reject the plan and keep the previous.
- `building_composition` normalized to sum 100.
- `height_profile` clamped to `capacity.max_height_tier`.
- Archetype change reverted unless `consecutive_windows_supporting_change >= 2` and sufficiency is medium or high.
- Composition delta capped at 15 points total per window; density and height at one step.
- Unknown top-level keys stripped and logged.

Cadence and concurrency: there is no server-side loop. `POST /api/plan/tick` replans every community whose input hash changed, serially, and returns. The operator panel page calls it every 10 seconds while open. There is also a manual trigger per block and for all. Never one Call B per post. At most one Call B in flight at a time, enforced by a lock row in the database.

### 4.5 Procedural Modeling Module and Renderer

Owns: asset library, placement rules, scene construction, interaction.

Placement rules (deterministic, seeded by `community_id`), kept deliberately simple:
- Clipped grid: a regular grid over the block's bounding box, keeping cells whose center lies inside the polygon, shrunk slightly from the edges. Cell count stands in for `capacity.lot_count`.
- Building cells = density-driven fraction of cells. Category per cell sampled from the six-category `building_composition` with a seeded RNG.
- Height per building from `height_profile` with small seeded jitter, capped by `capacity.max_height_tier`.
- Vegetation fills remaining cells according to `vegetation.level` and `types`.
- One plaza cell near the centroid holds crowd clusters, the stage, and the hero asset.
- Decorations on edge cells, ordered by prominence. People from `activity`, walking a short loop.
- Palette applied as a material color set. Lighting and effects applied per block.

Visual style rules (see PRD 8.11):
- All materials are flat or toon-shaded, vertex-colored or single-color, no photographic textures. Palette from the plan maps to a small set of material color slots (walls, roofs, accents, ground, foliage).
- One directional light plus ambient, soft shadow map, optional outline post-process. Background is a gradient.
- Each block is a raised slab with a beveled edge; the block polygon is extruded a small fixed height so divisions are legible.
- Assets are scaled to a consistent cartoon proportion table (for example tree height 0.6 to 0.9 of a low building) regardless of source pack.

Interaction rules (see PRD 8.12):
- Camera: orbit controls centered on the city centroid, pitch clamped (roughly 20 to 75 degrees), zoom clamped so the city never leaves the frame or fills it with one block. Damped so it feels physical.
- Picking: raycast against block slabs only, not against individual assets, so the whole block is the hit target on mouse and touch.
- States per block: idle, hovered (lift by a few units and brighten), selected (lift, brighten, camera frames it). Only one selected at a time.
- Events emitted to the app: `blockHover(id | null)`, `blockSelect(id | null)`, `blockPick(id, pointInBlock)` for post placement. The scene never owns app state; it renders it.
- Rebuild of a changed block animates (assets pop or fade in) so a plan change is noticeable.

Never: interprets posts, calls AI, modifies geography.

Overlay rendering (not part of the plan):
- Personal layer: each block exposes a fixed list of decoration slots (anchor points on edges and plaza areas, separate from building lots). The viewer's own placements fill those slots. Slots are stable across replans because they derive from the block polygon, not from the plan.
- Incident markers (Stage 4 item 5 at most): from the Civic layer, placed at the block's centroid or at a slot nearest the incident's location hint if resolvable, colored by status.
- Weather (product scope, not built this weekend): a global effect layer that would override any weather-type effect (`rain`, `snow`, `fog`) in a plan; non-weather effects in the plan still render.

### 4.6 Game layer (deterministic)

Owns: likes, comments, points ledger, shop catalog, inventory, personal placements.

Rules:
- One like per user per post, toggleable. Comments are single level.
- Points ledger is append-only: `{user_id, delta, reason, ref_id, created_at}`. Balance is the sum. Reasons and starting values are in PRD 8.8. Daily caps enforced at credit time.
- Shop catalog is generated from the taxonomy's decoration and vegetation enums with a price per item, so shop items always have an asset.
- Purchase is a transaction: debit ledger, increment inventory. Placement decrements inventory and writes `{user_id, community_id, slot_id, item_tag}`. Removal reverses it.
- Placements are private. No endpoint returns another user's placements.

Never: calls AI, changes public plans, affects aggregation except through engagement counts.

### 4.7 Civic layer (deterministic)

Owns: incident records and the government page.

Built this weekend (see docs/04 section 6 for what is not):
- An incident is created when `PostAnalysis.incident.type` is not `none`. Fields: `{incident_id, post_id, community_id, type, severity, location_hint, reported_at, source, status: "reported" | "verified", staff_note}`. Hidden posts never produce incidents; hiding a post removes its incident from the page.
- Status changes only through the government page, and only to `verified`.
- The government page also carries a hide button per row, calling the shared hide-post route.

Product scope, not built this weekend: trend history, weather polling, CSV export, the incident report form, `resolved` status. They are described in the PRD and would live in this layer.

Never: calls AI, writes summaries, changes plans or geography.

## 5. Interface contracts summary

Full schemas live in the prompt spec (docs/03). This table lists which module owns which contract.

| Contract | Producer | Consumer | Notes |
|---|---|---|---|
| `CommunityGeo` | Map | Aggregator, Planning, Modeling | Polygons never reach AI |
| `BlockLayout` | Map | Modeling | Scene-space simplified polygons |
| `PostInput` | Post Processing | AI Call A | One per request this weekend; batching is product scope |
| `PostAnalysis` | AI Call A | Aggregator | Validated before storage |
| `SemanticState` | Aggregator | Planning | Current and baseline |
| `PlanningInput` | Planning | AI Call B | Includes taxonomy block |
| `CommunityPlan` | AI Call B | Validator, Modeling | Only validated plans are stored |
| `AssetTaxonomy` | Modeling | Planning, Game (shop catalog) | Versioned, generated from the library |
| `DecorationSlots` | Modeling | Game, Renderer | Per-block stable slot ids derived from the block polygon |
| `Incident` | Civic (from `PostAnalysis.incident`) | Government page | Status changed only by staff |
| `WeatherState` | Civic (product scope, not built this weekend) | Renderer overlay | Polled, not posted |
| `PointsLedger`, `Inventory`, `Placement` | Game | Web app | Private per user |

## 6. Proposed tech stack (to confirm at kickoff)

| Layer | Proposal | Reason |
|---|---|---|
| Frontend and 3D | Next.js as a mobile-first PWA, React Three Fiber, drei | Installs to the home screen, camera and location via browser APIs, one codebase |
| 2D map picker | MapLibre GL or Leaflet | Free, GeoJSON native |
| Backend | Next.js route handlers or a small FastAPI service | Keep one repo if possible |
| Geometry | Turf.js (simplify, centroid, booleanPointInPolygon, adjacency) | Everything needed, no PostGIS setup |
| Storage | Hosted Postgres via the Vercel Marketplace | Ledger, inventory, placements, and incidents must be shared and persistent, so in-memory is no longer enough |
| Photos | Vercel Blob | Upload from the phone, serve to the analysis call and the feed |
| Weather | A free forecast API that needs no key | Product scope, not built this weekend |
| AI | Gemini only this weekend: Flash tier for Call A, Pro or Flash tier for Call B, behind a provider-neutral adapter | Schema-enforced JSON and native image input. A second provider is product scope after the demo works |
| Assets | Kenney or similar CC0 low-poly packs, glTF | Free, consistent style |
| Deploy | Vercel for frontend and API | One-command deploy |

### 6.1 LLM provider adapter

The pipeline package talks to models through one internal function: given a system prompt, a user payload, and a JSON schema, return parsed and validated JSON. One implementation this weekend:

- `gemini`: uses the native response schema so the API enforces the shape. Passes images directly for Call A. Temperature 0. Billing enabled before the event.

The interface stays provider-neutral so a second implementation (DeepSeek, using JSON mode with the schema in the prompt and text-only Call A) is a one-file addition after the demo works. An untested fallback is not a fallback, so it is not built before then. The stage-time fuse for a provider outage is the operator's preset plan button and the fallback video.

## 7. Data model

```
User           { id, display_name, role: "resident" | "government", created_at }
Post           { id, user_id, text, image_url?, lon, lat, created_at, community_id?,
                 is_incident_report, status: "pending" | "analyzed",
                 hidden, hidden_reason: "auto" | "operator" | null }
Like           { user_id, post_id, created_at }                 unique (user_id, post_id)
Comment        { id, user_id, post_id, text, created_at }
PostAnalysis   { post_id, ...PostAnalysis schema, created_at }
CommunityState { community_id, window_start, window_end, current, baseline, trend,
                 data_sufficiency, consecutive_windows_supporting_change, input_hash }
CommunityPlan  { plan_id, community_id, plan_json, input_hash, validator_log, created_at }
TrendPoint     { community_id, window_end, dimensions, valence, post_count, top_tags }
PointsLedger   { id, user_id, delta, reason, ref_id, created_at }
ShopItem       { item_tag, price, category, taxonomy_version }
Inventory      { user_id, item_tag, quantity }
Placement      { id, user_id, community_id, slot_id, item_tag, created_at }
Incident       { id, post_id, community_id, type, severity, location_hint, reported_at,
                 source, status, staff_note, updated_at }
WeatherState   { city_id, observed_at, condition, temperature, precipitation, wind }
```

Engagement for the aggregator is computed as `likes + 2 × comments` on the post at aggregation time.

## 8. API surface

City pipeline:
```
GET  /api/city                      → CommunityGeo[] + BlockLayout + DecorationSlots
POST /api/posts                     → create post (text, image, location, is_incident_report), triggers Call A, credits points
GET  /api/posts?community=&scope=   → feed for a block or citywide; always WHERE hidden = false AND status = 'analyzed'
PATCH /api/posts/:id/hide           → operator or government; sets hidden, excludes from feeds, aggregation, incidents
GET  /api/city/version              → { plans: { community_id: plan_id }, updated_at }; the scene polls this every 5 s
GET  /api/communities/:id/state     → SemanticState (current, baseline)
GET  /api/communities/:id/plan      → latest accepted CommunityPlan
POST /api/communities/:id/plan      → force a planning cycle (demo control)
POST /api/communities/:id/plan/preset → operator: write the hand-written, validated "festival plan" as the accepted plan
POST /api/plan-all                  → force planning for all communities
POST /api/plan/tick                 → replan changed-hash communities only; called by the operator panel's ticker every 10 s
GET  /api/communities/:id/posts     → recent posts and analyses (for the "why" panel)
```

Game layer:
```
POST /api/posts/:id/like            → toggle like, credits points
POST /api/posts/:id/comments        → (product scope, not built this weekend)
GET  /api/me                        → user, balance, inventory
GET  /api/me/ledger                 → (product scope, not built this weekend)
GET  /api/shop                      → catalog
POST /api/shop/buy                  → { item_tag } debit and add to inventory
GET  /api/me/placements             → own placements
POST /api/me/placements             → { community_id, slot_id, item_tag } place
DELETE /api/me/placements/:id       → remove, returns item to inventory
```

Civic layer (role-gated to government):
```
GET  /api/civic/incidents?community=&type=&status=&from=&to=
PATCH /api/civic/incidents/:id      → { status: "verified", staff_note }
(trends, weather, CSV: product scope, not built this weekend)
(hide-post lives at PATCH /api/posts/:id/hide, callable from the government page and the operator panel)
```

## 9. Determinism and replay

- Every AI call logs input hash, raw output, validated output, and validator corrections.
- A replay set of recorded inputs is kept for both calls. Rerun after any prompt or taxonomy change and diff.
- Modeling is seeded by `community_id` so a plan always renders the same block.

## 10. Live update

The scene polls `GET /api/city/version` every 5 seconds. It rebuilds only blocks whose plan id changed and re-fetches only those plans. No server push. After a user posts, the app marks their community as "planning" until its plan id changes, then clears the mark. This is what lets a judge watch their own block without anyone touching the operator laptop.

## 11. Public and personal layers in the renderer

The scene composes three inputs per block: the accepted public plan, the viewer's own placements, and the overlays. It re-renders a block when any of the three changes. Public plan changes trigger a full block rebuild; placement changes only touch the slot; overlays are separate objects so they never invalidate the block.

## 12. Extensibility to other cities

Adding a city means: a new neighborhood GeoJSON, a city center point, a timezone, and optional OSM hints. No prompt changes. No taxonomy changes unless new asset types are needed.
