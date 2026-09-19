# Product Requirements Document: Living City

Status: pre-hackathon planning draft, revision 2
Event: Hack the North 2026
Last updated: 2026-09-16

Revision 2 adds the full game loop (interactions, points, shop, personal city), the civic feedback layer, weather and incident reporting as extensions, and makes photo posting and mobile first-class.

## 1. One-line pitch

A mobile social game where people photograph and post about real places in their city. Posts grow a cartoon 3D city that mirrors the real one, earn points to decorate a personal version of it, and give the city government a live, structured picture of what residents are experiencing.

## 2. Problem and opportunity

Location-based feeds are lists. They say what happened somewhere but never show what a place feels like. City governments, meanwhile, get resident feedback late, unstructured, and through channels nobody enjoys using. There is no product where sharing daily life is fun in itself and, as a side effect, produces a live picture of the city for everyone, including the people who run it.

## 3. Goals

1. Show a recognizable cartoon miniature of Kitchener-Waterloo, divided by official planning boundaries.
2. Make posting a photo from a phone the primary action, and make its effect on the city visible.
3. Close a game loop: post or interact, earn points, buy decorations, place them in a personal city, come back.
4. Give a government viewer a structured, filterable feed of what residents report, separate from the game.
5. Keep AI in a strictly bounded role: it interprets posts and plans visual intent, and nothing else.

## 4. Non-goals

- Realistic GIS visualization or accurate building footprints.
- Native app store submission. The deliverable is a mobile-first installable web app (PWA).
- Direct messaging, follows, or a social graph beyond likes and comments.
- Multi-city at demo time. The architecture allows it; the demo shows one city.
- Content moderation beyond automated flagging and a hide button for the government view.
- Real emergency dispatch. Incident reports are informational and labeled as unverified until a human marks them.

## 5. Users

| User | What they want | How the product serves them |
|---|---|---|
| Resident or student | Share daily life, see their neighborhood come alive, build something of their own | Photo posts, points, personal city decorations |
| Visitor | Pick where to go by vibe | Rotate the public city, read block summaries |
| Government staff | Know what residents experience, early and structured | Civic dashboard with incidents, mood trends, filters, export |
| Judge | Understand it in two minutes | Live loop from phone photo to city change to points to decoration |

## 6. Scope tiers

Everything below is required for the product. The tiers describe the product's shape. The hackathon build order is not the tiers: it is the demo script in docs/04, and docs/04 section 6 lists product features deliberately not built that weekend.

- **Tier 1, core loop (must ship):** mobile photo or text post with location, public cartoon city driven by AI plans, likes and comments, points, shop, personal decorations.
- **Tier 2, civic (should ship):** government view with incident feed, mood trends per community, filters, status, export.
- **Tier 3, extensions (ship if time):** real weather driving the city's weather, incident markers on the map, disaster reporting flow.

## 7. User stories

Core loop (Tier 1):

1. As a resident on my phone, I can take or pick a photo, add a caption, confirm my location, and post. Text-only posts are allowed.
2. As a resident, I can see the post assigned to a community and, after the next planning cycle, see that community's block change.
3. As a resident, I can like and comment on other people's posts, in a feed filtered to the block I have selected or to the whole city.
4. As a resident, I earn points for posting, for posting with a photo, and for likes and comments I give and receive.
5. As a resident, I can open a shop, spend points on decorations, and see my inventory.
6. As a resident, I can switch my view to "my city", place owned decorations onto blocks, and they persist for me. Nobody else sees my decorations.
7. As a viewer, I can rotate, zoom, pan, hover, and tap blocks in a cartoon city that I recognize.
8. As a viewer, I can open a "why does it look like this" panel with tags, reasons, and recent posts.

Civic (Tier 2):

9. As government staff, I can open a dashboard that lists incidents residents reported, with type, community, time, source post, and status.
10. As government staff, I can filter by community, type, time range, and status, and mark an incident verified or resolved.
11. As government staff, I can see mood and activity trends per community over time, derived from the same analysis that drives the city.
12. As government staff, I can export the filtered list as CSV.

Extensions (Tier 3):

13. As a viewer, I see real current weather over the city, from a weather service, not from posts.
14. As a resident, I can report an incident (flooding, fallen tree, blocked road, outage) with a photo and location, and it appears as a marker on the block for everyone, labeled unverified until staff verify it.
15. As government staff, incident reports and weather appear together so I can see damage reports in the context of the storm that caused them.

## 8. Functional requirements

### 8.1 Mobile app

- Mobile-first installable web app. Add-to-home-screen works on iOS Safari and Android Chrome.
- Camera through the browser file input with capture, so no native permissions flow is needed. Device location through the browser geolocation API with a manual fallback by tapping a block.
- All Tier 1 flows complete on a phone: post with photo, like, comment, buy, decorate.
- Performance: the city renders at 30 fps on a recent mid-range phone with all blocks, with a reduced-detail mode below that.

### 8.2 Map

- Official boundaries. Community assignment uses the municipal planning-area boundaries published by the City of Kitchener and the City of Waterloo as raw polygons. Neighborhood-association boundaries are not used. If a finer or coarser official level is chosen at kickoff, the same level must be used for both cities.
- Post assignment always uses the raw official polygons. The visual blocks are a separate layer and never affect assignment.
- The visual layer may be hand-drawn simplified blocks (the hackathon default) or automatically simplified official polygons (later cities). Either way it is visual only.
- Preserve silhouette, relative position, and adjacency. Output per-community metadata.

### 8.3 Posting and interaction

- Post: photo (optional), text (required if no photo), location, timestamp, author.
- Likes: one per user per post, toggleable. Comments: text, one level, no threading.
- Engagement is a bonus weight in analysis, never a requirement. A new post with zero interactions has full base weight.
- Feed: recent posts for the selected block, or citywide. Government view can hide a post.

### 8.4 Post analysis (AI)

- Every post analyzed once into a compact structured record: dimensions, tags, activity, place, temporal scope, confidence, flags.
- Photo is analyzed directly when the provider supports images. The analysis never assigns or changes the community.
- The same analysis emits an optional incident record when a post explicitly describes one. It never infers an incident from mood.

### 8.5 Aggregation (deterministic)

- Per community, a current-window state and a long-term baseline, with sufficiency and trend.
- Weight formula: base weight 1, multiplied by confidence and relevance, multiplied by an engagement bonus of `1 + 0.5 × log(1 + engagement)`, multiplied by recency decay. Zero engagement gives full base weight.

### 8.6 Community planning (AI) and modeling

- Unchanged from revision 1: strict JSON plan per community, validated against a versioned taxonomy and stability limits, built deterministically from a prebuilt asset library.
- Incidents and weather do not enter the plan. They are overlays.

### 8.7 Public and personal layers

- The **public layer** is the AI-planned city. It is the same for everyone and is what the government view reflects.
- The **personal layer** is a per-user set of decoration placements on top of the public layer. Placements go into predefined decoration slots per block, so they never change geometry or overlap the plan's structural assets.
- A user sees public plus their own personal layer. Others and the government see only the public layer.
- Personal placements persist per user and survive public replans, because slots are stable per block.

### 8.8 Points, shop, inventory

- Points ledger per user: every credit and debit is a row with reason and reference.
- Earning rules (starting values, tunable): post 10, post with photo 20 total, comment given 3, like given 1, like received 2, comment received 4, first post in a community that day 5 bonus, verified incident report 25. Daily caps on likes given and comments given to blunt farming.
- Shop: catalog of cosmetic decoration items with a price. Items are drawn from the same asset taxonomy so they match the city's style.
- Purchase debits the ledger and adds to inventory. Placing an item consumes one unit from inventory; removing returns it.

### 8.9 Civic feedback view

- Separate route with a role gate. Government users are seeded accounts for the demo.
- Incident feed: type, severity, community, location hint, time, source post with photo, reporter anonymized, status (reported, verified, resolved), staff note.
- Community trend panel: dimensions and valence over time, top tags, post volume, from the aggregator.
- Filters: community, type, time range, status. CSV export of the filtered incident list.
- Nothing in this view is generated by AI beyond the per-post analysis already done. Summaries are computed, not written.

### 8.10 Weather and incidents (Tier 3)

- Weather from a free public forecast service, polled per city on a cadence. It drives global weather effects (rain, snow, fog, sky tone) that override any weather-type effect in a plan.
- Incident report flow: same post form with an incident toggle and type picker. It produces a normal post plus an incident record marked "reported by user" with high confidence.
- Incident markers render on the block as an overlay, colored by status. They are removed when resolved.

### 8.11 Visual style (required)

The city must read as a cartoon miniature, not as a GIS view or a grey box model.

- Low-poly, flat or toon-shaded assets with no photographic textures. Rounded or chunky proportions, slightly exaggerated.
- Saturated but harmonious colors driven by the plan's palette. Ground and roads in soft tones so blocks pop.
- Soft directional light with gentle shadows, optional subtle outline pass. Gradient background.
- Blocks sit on a slightly raised base with a visible edge, like pieces on a board.
- The whole city fits in view at default zoom and reads as one object.
- Animated life: people walk, effects float, lights glow.

### 8.12 Interaction (required)

- Rotate by drag or one-finger drag. Zoom by scroll or pinch. Pan by right-drag or two-finger drag. Camera pitch clamped so the user can never go under the ground or straight overhead.
- Hover highlights a block and shows name and mood. Tap or click selects it, opens the block panel, and frames the camera. Tap empty space to deselect.
- In "my city" mode, tapping a block opens its decoration slots; tapping a slot places the selected inventory item or removes the one there.
- While composing a post, tapping a block sets the location if device location is unavailable.
- Touch targets are whole blocks or slot markers, never small handles. Works on a laptop trackpad and on a phone.

## 9. Non-functional requirements

| Requirement | Target |
|---|---|
| Post to visible public change | under 60 seconds when planning is triggered |
| Post analysis latency | under 3 seconds per post, including photo |
| Planning call latency | under 10 seconds per community |
| Points credit after an action | immediate, in the same request |
| Render performance | 30 fps on a laptop and on a recent mid-range phone |
| Personal layer persistence | survives reload and public replans |
| AI cost during demo | negligible; small models, cached prompts, billing enabled for rate limits |
| Determinism | replaying stored inputs reproduces stored plans |

## 10. Success metrics for the hackathon

- On a phone in front of judges: photo, post, like, points credited, buy, place a decoration, all in one pass.
- The public block changes after the planning trigger and the "why" panel explains it.
- The government dashboard shows the incident from a scripted demo post with its photo and lets staff verify it.
- The city outline is recognized by at least one judge unprompted.
- Zero validator hard failures during the demo.

## 11. Key product decisions

- **Demo city: Kitchener-Waterloo**, using each city's official planning-area boundaries, same level in both cities, merged into one map. Cambridge excluded.
- **Mobile-first PWA, not native.** One codebase, deploys to Vercel, installs to the home screen, camera and location through the browser. Native is a post-hackathon option.
- **Photos are core, not stretch.** If cuts are needed, cut photo *analysis* (keep the photo, analyze the caption) before cutting photo posting.
- **One model provider at a time.** The adapter is provider-neutral, but an untested second provider is not a fallback. Add one only after the first works end to end.
- **Two layers, one city.** The public layer is shared truth. Personal decorations are a private overlay in fixed slots. The government sees only the public layer and the civic data.
- **AI stops at per-post analysis and per-community plans.** Points, shop, inventory, civic dashboard, weather, and incident markers are all deterministic code on top of those two outputs.
- **Incidents are structured records, not mood.** They come from explicit descriptions in posts or from the incident report form, carry a location hint and status, and never alter a community's visual plan.

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Scope is large for four people | Core loop unfinished | Tier order is binding; Tier 2 and 3 start only after Tier 1's gate |
| Kitchener and Waterloo boundary datasets at different levels | Inconsistent community sizes | Pick one official level at kickoff and confirm both cities publish it |
| Polygon simplification breaks the silhouette | Loses the visual hook | Conservative simplification; visual-only fallback polygons |
| Photo analysis slow on stage | Post latency | Text-only fallback in the post flow; preset plan button; fallback video |
| AI output drift or invalid JSON | Broken block | Validator with clamps and previous-plan fallback |
| Points farming during demo | Silly numbers | Daily caps and per-user-per-post uniqueness |
| Personal decorations collide with public assets | Visual mess | Fixed decoration slots per block, separate from the plan's lots |

## 13. Open questions

- Which official planning-area level for each city. Because assignment is the only use, the two cities may use different levels. Confirm at kickoff.
- Accounts: anonymous device-bound users for the demo, or a lightweight sign-in? Default: device-bound with a chosen display name.
- Which free weather service: default to one that needs no API key.
- Does a verified incident change the public block at all? Default: marker only, never the plan.
