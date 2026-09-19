# Role Playbook: Map, then Civic and Game CRUD

You own the city's shape for one stage, then you are the team's spare pair of hands on the two critical paths. Read docs/04 first; the demo script there is the build list.

Owned packages: `packages/map` (Stage 0), `packages/civic`, the CRUD half of `packages/game`, the government page. Fixtures you produce: the hand-drawn processed city, `slots.json`, `incidents.mock.json`.

Read fully: docs/04, docs/02 sections 4.1, 4.6, 4.7, docs/03 section 2.1 and the `incident` block in 3.1, docs/01 sections 8.2, 8.8, 8.9.

## Your contract

How you build it is yours. The inputs and outputs below are not. If an input is late, use the fallback in the table, keep the interface, and swap in the real thing when it lands.

Inputs:

| Input | From | Shape | If it is late |
|---|---|---|---|
| Real map of Kitchener-Waterloo, official planning-area GeoJSON per city | Public | GeoJSON | Nothing blocks you; these are public |
| `contracts` package | Pipeline, Stage 0 | Zod types for `CommunityGeo`, `BlockLayout`, `Incident`, game tables | Type against docs/03 section 2.1 and docs/02 section 7 by hand; validate later |
| Shop items and prices | 3D's manifest, Stage 0 | 6 items with `item_tag`, price | Six placeholder items with the taxonomy's decoration tags |
| Database migrations | Pipeline, Stage 1 | Tables from docs/02 section 7 | In-memory store behind the same function signatures; swap later |
| `PostAnalysis` records with `incident` | Pipeline, Stage 2 | docs/03 section 3.1 | `incidents.mock.json` |

Outputs:

| Output | Shape | Who needs it | When |
|---|---|---|---|
| `packages/map/data/processed/city.json` | `CommunityGeo[]` + `BlockLayout` for 12 to 20 hand-drawn blocks | Everyone | Gate 0 |
| `packages/map/data/processed/slots.json` | 3 slots per block: `{community_id, slot_id, x, y}` in block coordinates | 3D, Game | Stage 1 |
| `assignCommunity(lon, lat) → community_id` | Point-in-polygon over the official polygons, mapped to a drawn block id; if the official area has no drawn block, or the point is outside every polygon, the nearest drawn block by centroid, so every post lands on a block a judge can watch | Pipeline | Stage 1 |
| Identity: a middleware that auto-creates a `User` per device cookie and exposes `currentUser(req)`; a role gate for the seeded government account | Function and middleware | Every route, Product's QR page | Stage 1, first thing |
| Game CRUD: `credit(user, reason, ref)`, `balance(user)`, `catalog()`, `buy(user, item)`, `toggleLike(user, post)`, `place(user, block, slot, item)`, `remove(user, placement)` | Functions in `packages/game`, against the database | Product's screens, Pipeline's credit hook and engagement count | Stage 1 |
| CRUD routes: `GET /api/me`, `GET /api/shop`, `POST /api/shop/buy`, `POST /api/posts/:id/like`, `GET/POST/DELETE /api/me/placements`, `PATCH /api/posts/:id/hide`, `GET /api/city/version`, `GET /api/posts` feed filtered to analyzed and unhidden, per-user post rate limit (one per 30 s) | docs/02 section 8 | Product, Pipeline, demo moments 3, 5, 8 | Stage 1 |
| `Incident` records and the government page | docs/02 section 4.7, one route | Demo moment 6 | Gate 2 |

## Not building
Loading, merging, snapping, or simplifying official polygons for the visual layer. Trend charts, CSV, weather, incident form, status beyond verify. See docs/04 section 6.

## Suggested checklists

The stages below are one reasonable way to meet the contract. Reorder or replace steps freely as long as the outputs land by their gates.

### Stage 0
- [ ] Draw 12 to 20 central Kitchener-Waterloo blocks in a GeoJSON editor over the real map: simplified 4 to 8 vertex shapes that together still read as the city (both campuses, Uptown, Downtown Kitchener, Victoria Park, the ION corridor). Give each a `kw:` id, name, adjacency, centroid, area, and capacity (height tier 4 for Downtown Kitchener and Uptown, 3 for campuses, 1 to 2 elsewhere). Commit as `packages/map/data/processed/city.json` in the `CommunityGeo` and `BlockLayout` shapes. This is the visual city for the weekend.
- [ ] One official planning-area GeoJSON per city into `packages/map/data/raw/` with `SOURCE.md` (URL, license, level). Used only for assignment. Do not merge, snap, or simplify them. Different levels between the cities are acceptable.
- [ ] `incidents.mock.json`: 3 incidents, one per status.

Gate 0 criterion you own: the hand-drawn city renders as flat outlines in the stub app.

### Stage 1
- [ ] Identity middleware: device cookie to `User`, auto-created on first request; `currentUser(req)`; role gate for the government account. Land this first; every route and every screen needs a user id.
- [ ] Assignment function: point-in-polygon over the raw official polygons, mapped to the hand-drawn block ids; nearest drawn block by centroid when there is no match. Hand it to Pipeline.
- [ ] Decoration slots: 3 stable slots per hand-drawn block (edge points and one plaza point), committed as `slots.json` with the city.
- [ ] `packages/game` CRUD with Product: append-only ledger, credit function with the values from docs/01 section 8.8 (no caps), balance, shop catalog from the manifest's 6 items, buy transaction, placements CRUD. Against the database once Pipeline's migrations land.
- [ ] CRUD routes: me (balance, inventory), shop, buy, like toggle (credits both sides), placements, hide (sets `hidden`, `hidden_reason = 'operator'`), version (`{plans: {community_id: plan_id}, updated_at}`), the feed route filtered to `hidden = false AND status = 'analyzed'`, and the post rate limit.

Gate 1 criteria you own: a post's coordinates resolve to the right block; a like credits points; a purchase changes inventory.

### Stage 2 (Civic)
- [ ] `packages/civic`: an `Incident` from every `PostAnalysis` whose `incident.type` is not `none`. Reporter anonymized. Hidden posts produce none.
- [ ] Government page, role-gated to the seeded account: list with photo thumbnail, community, type label (4 distinct, rest "other"), time, status, verify button, hide button. Nothing else.

Gate 2 criterion you own: moment 6 runs on the deployed build.

### Stage 3
- [ ] Verify and hide rehearsed; the scripted incident reproducible after reset.
- [ ] Phone holder in rehearsals.

### Stage 4 (only after Gate 3, in docs/04 order)
- [ ] Incident marker data if 3D reaches item 5. Screenshots, README section on boundaries.
