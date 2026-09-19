# Hackathon Execution Plan: The Demo Path

Status: pre-hackathon planning draft, revision 5
Last updated: 2026-09-17
Team of four. Stage-based, not clock-based.

Revision 3 rebuilds the plan around one idea: build the demo, not the product. The PRD describes the product. This document describes the weekend. Where they disagree about what to build first, this document wins.

Revision 4 cuts total work after a feasibility review: hand-drawn block polygons are the default visual layer (official polygons only for assignment), Gemini is the only provider this weekend, the building mix shrinks to six categories, block placement uses a clipped grid, the Map owner moves to Civic and game CRUD from Stage 1, a wall-clock backstop protects rehearsal time, and the operator gets a preset "festival plan" button.

Revision 5 fixes two gaps: there is no long-running process on Vercel, so Call A runs inline in the post handler and planning is driven by a ticker in the operator panel; and the CRUD-shaped routes move from Pipeline to the Civic owner to balance load.

## 1. The one question

Before building anything, ask: **will a judge see this on stage, or touch it on the phone, during the demo?** If the answer is no, it is not built until the whole demo runs end to end. There is no other cut rule.

Tiers in the PRD describe the product's shape. They are not a build order. The build order is the demo script below.

## 2. The demo script (frozen)

About two and a half minutes on stage, then judges hold the phone. Every line names the features it needs. This list is the build list.

| # | Moment | Seconds | Must exist |
|---|---|---|---|
| 1 | The rotating city. "This is Kitchener-Waterloo. Every block is a real neighborhood. That is the university, that is Uptown, that is Downtown Kitchener." | 15 | Hand-drawn blocks over the real map rendered as cartoon blocks; recognizable outline; rotate, zoom, pan; 3 to 4 blocks that look clearly different |
| 2 | Tap two contrasting blocks. Read their summaries. Open the "why" panel on one. | 15 | Block select and framing; panel with summary, mood, top tags, reasons, recent posts with photos |
| 3 | On a phone: take a photo, caption, confirm location in a quiet block, post. Points toast. | 25 | PWA on the home screen; camera capture; device location with block-tap fallback; upload with text-only fallback; post assigned to a community; points credited and shown |
| 4 | Trigger planning. The block changes: lights, a crowd, music notes, warmer light. "Identity stayed, mood changed. The AI decided intent; the engine built it." | 20 | Call A on the post; aggregator; Call B; validator; rebuild of one block with a visible animation; the change tuned to be loud |
| 5 | Spend the points: open the shop, buy a decoration, place it on the block in "my city". Switch to public view: it is gone. | 20 | Shop with a few items; balance; buy; my-city toggle; slot tap to place; persistence; public view hides placements |
| 6 | Government view: the scripted incident post is there with its photo. Tap verify. | 15 | Incident extraction from Call A; one government page listing incidents with photo, community, type, status; a verify button |
| 7 | Architecture slide: two AI calls, both end in JSON, everything else is deterministic. | 10 | A slide |
| 8 | QR code. "Post something yourself." Judges post from their phones and watch their block. | Judge time | Everything in 3 and 4, robust, plus: inline analysis on post with a per-user rate limit; a planning ticker in the operator panel that replans changed blocks every 10 seconds; the scene polling for changed plans so a judge's block updates on its own; posts hidden from the public feed until analyzed and auto-hidden when flagged `unsafe`; a one-tap hide-post control for the operator and the government page; a reset control |

Everything in this table is the whole build. Section 6 lists what is deliberately not built.

## 3. Breadth caps

The spec's enums stay as written. The build maps most of them to a handful of real things. These numbers are ceilings for the weekend.

| Thing | Cap | Note |
|---|---|---|
| Blocks in the city | 12 to 20 | Central Kitchener-Waterloo; the outline must still read |
| Visually distinct archetypes | 4 or 5 | Others alias to the nearest one in the asset manifest |
| Building assets | 8 to 12 | Recolored by palette for variety |
| Decoration and vegetation assets | 10 to 15 | Includes the shop items |
| Shop items | 6 | Priced so one demo post buys one |
| Decoration slots per block | 3 | Enough to place and see it |
| Palettes with real material sets | 4 | Others alias |
| Effects | 3 | Music notes, sparkles, fireflies |
| Incident types with a distinct label | 4 | flooding, fallen_tree, road_blocked, power_outage; the rest show as "other" |
| Seed posts | 6 to 10 per block | Enough for every block to have a summary |
| Seed incidents | 3 | One is the scripted demo incident |

## 4. Roles

| Role | Builds for the demo | Packages |
|---|---|---|
| Map, then Civic | Stage 0 only: hand-drawn block polygons and official polygons for assignment. From Stage 1: decoration slots, the game package CRUD, the CRUD-shaped routes (hide, version, tick, rate limit), then moment 6's incident page | `map` (Stage 0), `civic`, `game` CRUD, the government page |
| Pipeline | Moments 3, 4, 6's intelligence: upload, Call A with incidents, aggregator, Call B, validator, the post and plan routes, points credit hook, moment 4 tuning | `pipeline`, `contracts` |
| 3D | Moments 1, 2, 4, 5's visuals: cartoon blocks, event look, rebuild animation, placements rendering | `modeling`, `apps/web/scene` |
| Product | Moments 2, 3, 5, 8's UI: PWA, post flow, panel, shop and my-city screens, operator panel, QR page, demo operation | `apps/web`, `fixtures` |

## 5. Stages

A stage ends at its gate, checked by all four on the deployed build. Nobody waits: a blocked person writes the fixture they need or takes their own next-stage item.

### Stage 0: Scaffold

Stage 0 is deliberately thin. Anything not needed for someone else to start is pushed into Stage 1.

| Owner | Tasks |
|---|---|
| Product | Monorepo; plain Next.js app deployed (PWA install comes in Stage 1); stub API behind `USE_FIXTURES`; `posts.seed.json` first cut (3 posts per block, the three incidents, two near-misses); Vercel project with Postgres and Blob; GitHub Projects board |
| Pipeline | `contracts` package compiling with every schema; `.env.example`; `post-analysis.mock.json`, `planning-input.mock.json`; one trivial Gemini call with the real `CommunityPlan` response schema to confirm the schema is accepted. Migrations move to Stage 1. |
| Map | The processed city, hand-drawn: 12 to 20 central blocks as simplified polygons drawn in a GeoJSON editor over the real map, with ids, names, adjacency, centroid, area, capacity. This is the visual layer for the whole weekend, not a fallback. Plus one official planning-area GeoJSON per city in `map/data/raw` for point-in-polygon assignment only. `incidents.mock.json`. |
| 3D | Asset pack committed under the caps; manifest mapping every enum to an asset or alias; `taxonomy.v1.json`; `plans.mock.json` with the 4 or 5 distinct archetypes |

Gate 0: everyone has pushed; the preview deploys; contracts compile; fixtures validate; the hand-drawn city renders as flat outlines in the stub app; Gemini accepts the plan response schema.

### Stage 1: Slice parts

Each owner builds exactly their part of the demo path, against fixtures, on their own machine.

| Owner | Tasks |
|---|---|
| Map, now Civic | Point-in-polygon assignment function over the official polygons, exposed to Pipeline; decoration slots (3 per hand-drawn block) committed as data; `packages/game` CRUD: ledger, credit function, shop catalog from the manifest, buy, placements, against the database; the CRUD routes: `PATCH /api/posts/:id/hide`, `GET /api/city/version`, per-user rate limit middleware |
| Pipeline | Database migrations; Gemini adapter with response schema and image input; photo upload; Call A with incident rules, run on the seed set, incidents correct on the three seeded posts and absent on the near-misses; aggregator with base-weight formula; points credit hook called on post |
| 3D | Placement engine on a clipped grid: lay a regular grid over the block, keep cells whose center is inside the polygon, assign cells from the plan (buildings by composition and density, vegetation, a plaza cell for crowds and stage); cartoon materials, slabs, lighting; one loud "event" look (string lights, crowd cluster, music notes, warm light) that a plan can switch on; rebuild as a simple fade or pop; placements render into the provided slots; people idle animation only |
| Product | PWA install; orbit camera and block tap on mouse and phone; block panel; post flow with camera, location, text fallback; like toggle; points toast; shop screen on top of the game package (my-city mode comes in Stage 2) |

Gate 1: the hand-drawn city renders as cartoon blocks; every mock archetype looks different and the event look is obviously loud; on a phone, a photo post round-trips through the stub, a like credits points, a purchase changes inventory; Call A output on the seed set is valid with correct incidents; a post's coordinates resolve to the right official community.

### Stage 2: The demo runs once

Integrate along the script, in script order, on the deployed build, on a phone. Ugly is fine. Contracts freeze at the gate.

| Owner | Tasks |
|---|---|
| Pipeline | Call B, `PlanningInput`, validator with clamps and previous-plan fallback; plans for all blocks from the seed; post and plan routes; `POST /api/plan/tick` that replans every changed-hash block serially and returns; the preset "festival plan" route that writes a hand-written, validated plan into the demo block; demo tuning: sufficiency thresholds low enough that one scripted post flips the demo block's mood and switches the event look on, while archetype stays |
| 3D | Real plans; rebuild only the changed block; `blockPick` and `slotTap` events |
| Product | Real endpoints; post flow resolves the community; "why" panel with reasons and posts; my-city placement persisted and private; operator panel with reset, manual trigger, preset plan, and the planning ticker (calls the tick route every 10 seconds while the panel is open) |
| Civic | Incident records from real Call A output; one government page: list with photo, community, type, status, verify button, hide button; seeded government account |

Gate 2: moments 1 through 6 run in order on a phone against the deployed build, operated by someone other than the person who built each part.

### Stage 3: Protect the demo

| Owner | Tasks |
|---|---|
| Product | Record the fallback video of moments 1 through 6 immediately after Gate 2; QR page; scene polling with the "planning" highlight on the judge's block; one-tap hide in the operator panel; judge flow tested on four phones at once and on venue-like bad network; reset tested |
| Pipeline | Pending-until-analyzed and auto-hide on `unsafe`; retry and timeout on upload and both model calls; a concurrency guard so simultaneous posts do not exceed the provider's rate; load test with four phones; replay set recorded; spend alerts and billing confirmed |
| 3D | Frame rate on the demo laptop and the demo phone; reduced-detail mode if needed |
| Civic | Verify flow rehearsed; hide button on the government page; rate limit verified; the scripted incident reproducible after a reset |
| All | Two full rehearsals of the script with the operator and the phone holder swapped |

Gate 3: the video exists in shared storage; two rehearsals passed; a judge-style post from a stranger's phone worked; four people posting at once from four phones all saw their blocks change without anyone touching the operator laptop; a post flagged `unsafe` never appeared in the feed; the operator hid a post in one tap.

### Stage 4: Widen, only within the caps

Only after Gate 3, and only in this order because it is the order a judge notices:

1. The 3 to 4 hero blocks look great: hero assets, more distinct palettes, better people.
2. Remaining blocks up to the cap, aliased archetypes.
3. Panel and shop polish, empty states, block labels.
4. One weather effect driven by a fixture, presented as live-ready.
5. Incident marker on the demo block, colored by status.
6. README and Devpost.
7. DeepSeek adapter as a second provider, only if everything above is done and there is nothing left to rehearse.

Gate 4: feature freeze. Rehearse once more after any change in this stage.

### Stage 5: Submit

Screenshots, video, Devpost, README, submission.

## 6. Not built this weekend

These are in the PRD and stay there. None of them appear in the script, so none of them are built before Gate 3, and most not at all. If an AI assistant or a teammate starts one, stop and point here.

- Comments. Likes carry engagement.
- Daily caps on points. Nobody farms in a demo.
- Ledger history page. The balance is enough.
- Separate inventory screen. Inventory shows inside the shop.
- CSV export.
- Incident status beyond a single verify button.
- Trend charts and trend tables.
- Weather polling from a live service.
- Incident report toggle on the post flow. Incidents come from ordinary posts.
- Time slider, global day/night clock, second city.
- A second model provider before Stage 4 item 7.
- Loading, merging, or simplifying official polygons for the visual layer. The visual city is hand-drawn.
- Lot-grid algorithms beyond a clipped regular grid. Idle animation beyond people.
- More than 4 or 5 distinct archetypes, more than 6 shop items, more than 3 slots per block.

## 7. Making moment 8 safe

Moment 8 turns strangers loose on the shared city on stage. Four things make that survivable. They are in the script, not optional.

- **Load.** There is no long-running process on Vercel, so there is no queue and no loop. Call A runs inline in the post handler, one request per post, with a concurrency guard and one post per user per 30 seconds. Judges are tens of people, not thousands; billing on the Gemini key covers that rate. Planning never runs per post: the operator panel page runs a ticker that calls `POST /api/plan/tick` every 10 seconds, and the tick replans only communities whose input hash changed, serially, then returns. If the panel is closed, nothing replans, which is the intended off switch. The fuse for a Gemini outage is the preset plan button and the fallback video.
- **Live update.** The scene polls a cheap version endpoint every 5 seconds and rebuilds only blocks whose plan id changed. No SSE. After posting, the app highlights the judge's block with a "planning" state so they know where to look and that it takes up to half a minute.
- **Content.** A post is invisible in the public feed and panel until Call A returns. If Call A flags `unsafe`, or the provider refuses the content, the post is auto-hidden. Hidden posts are excluded from feeds, aggregation, and incidents.
- **Hide-post.** One tap, in the operator panel and on the government page, sets `hidden` on any post. Every feed query filters on it. It is a PATCH and a WHERE clause, and it is the fuse for the whole moment.

## 8. Making moment 4 land

The pitch lives in the twenty seconds when a block changes. Rehearse this more than anything else.

- The demo block starts sparse and calm. Seed it that way.
- The scripted post is loud and unambiguous: a photo with lights and a crowd, a caption about live music tonight.
- The aggregator's sufficiency thresholds and the validator's cosmetic limits allow mood, lighting, effects, activity, and decorations to change from one post in a sparse block. Archetype, density, and buildings still do not. This is tuned in Stage 2 and locked at Gate 3.
- The rebuild animates: assets pop in, lights come on, notes float. Silence on stage for two seconds while it happens.
- Latency budget: Call A inline under 3 seconds, tick every 10 seconds, Call B under 10 seconds, poll 5 seconds. Worst case about 28 seconds from post to rebuild. On stage the operator uses the manual trigger right after the post, which skips the tick. The "planning" highlight on the block covers the rest.
- The preset plan button. A valid Call B can still be boring. The operator panel has one button that writes a hand-written, validator-passing "festival plan" into the demo block. On stage, if the real plan comes back flat, press it and keep talking. This is a few lines of code and it protects the whole pitch.

## 9. The one clock rule

Stages, not clocks, except for this: **if fewer than 8 hours remain and Gate 2 has not passed, cut moments 5 and 6 from the script.** Rehearse moments 1 through 4 and 8 until any team member can run them blind, record the video, and submit that. Nothing else in this plan stops a team from still integrating at hour 30. This does.

## 10. Risk register

| Risk | Signal | Response |
|---|---|---|
| Venue network fails on stage | Upload or model call hangs | Text-only fallback, tethered phone, fallback video from Gate 2 |
| The block change is too subtle | Rehearsal audience does not notice | Lower thresholds, louder event look, choose a sparser demo block |
| Official datasets at different levels | Assignment inconsistent between cities | Assignment only; the visual layer is hand-drawn so this cannot affect the demo. Use whichever official level each city publishes. |
| Call B returns a valid but flat plan on stage | Moment 4 falls flat | Preset festival plan button in the operator panel |
| Gemini outage on stage | Posts stay pending | Preset plan button, fallback video, operator narrates |
| Breadth creep | Someone builds a sixth archetype before Gate 3 | Section 6 and the one question |
| Product or Pipeline behind at a gate while Civic is idle | Gate check shows one owner's criteria unmet | Civic takes any CRUD-shaped item from that owner's list; the contracts say what shape it must have |
| A judge's location falls in an official area with no drawn block | Their post lands nowhere visible | Assignment falls back to the nearest drawn block; the venue itself is inside the University District block |
| Model output drift | Validator corrections rising | Replay set, terse retry, preset plan button |
| Demo phone dies | Battery or OS prompt on stage | Second phone installed and logged in; operator laptop can run the phone flow in a narrow window |
| Judges hit the model rate limit | Posts fail or stay pending | Concurrency guard and rate limit from section 7; billing enabled; operator can pause the QR page |
| Operator panel closed or laptop asleep | Blocks stop replanning | The ticker lives in the panel by design; keep it open and the laptop awake; the manual trigger is the backup |
| A stranger posts something bad on stage | It shows in the feed or the panel | Pending-until-analyzed, auto-hide on `unsafe`, one-tap hide in the operator panel |

## 11. Definition of done

- The script runs on a phone against the deployed build, operated by any team member.
- A stranger's phone can post through the QR page.
- The fallback video exists.
- README explains the four modules, the two layers, and "AI ends at JSON".
- Devpost has the video and three screenshots: city, block change, government verify.
