# Role Playbook: Product

You own the phone in the judge's hand: the PWA, the post flow, the block panel, the shop and my-city screens, the operator panel, the QR page, and the demo itself. The game package's CRUD is built by the Civic owner; you build the screens on top of it. You are the first to notice when someone builds something the script does not show.

Owned packages: `apps/web` (except `apps/web/scene` and the government page), `packages/fixtures`, and the screens over `packages/game`. Fixture you produce: `posts.seed.json`.

Read fully: docs/04, docs/01, docs/02 sections 4.6, 5, 7, 8, 10, 11, docs/05.

## Your contract

How you build it is yours. The inputs and outputs below are not. If an input is late, use the fallback in the table, keep the interface, and swap in the real thing when it lands.

Inputs:

| Input | From | Shape | If it is late |
|---|---|---|---|
| `city.json` | Map, Stage 0 | `CommunityGeo[]` + `BlockLayout` | Three hand-typed blocks |
| `<CityScene>` component | 3D, Stage 1 | Props and events listed in roles/3d.md | A flat SVG of the block polygons with the same props and events |
| Post and plan routes | Pipeline, Stage 2 | docs/02 section 8 | Your own stub behind `USE_FIXTURES=1`, which you build in Stage 0 anyway |
| Identity, me, shop, buy, like, placements, hide, version routes | Civic, Stage 1 | docs/02 section 8 | The same stub |
| `contracts` package | Pipeline, Stage 0 | Zod types | Type against docs/03 by hand |

Outputs:

| Output | Shape | Who needs it | When |
|---|---|---|---|
| Deployed app on Vercel, previews per PR | URL | Everyone | Gate 0 |
| Stub API behind `USE_FIXTURES=1` | Every route in docs/02 section 8 the script needs, serving fixtures | Everyone in Stage 1 | Gate 0 |
| `posts.seed.json` | Posts in the `Post` shape, incidents and near-misses included | Pipeline, Civic | Gate 0, grown in Stage 1 |
| PWA install, post flow, block panel, shop, my-city, likes | Working on a phone | Demo moments 2, 3, 5 | Gate 1 with stubs, Gate 2 real |
| Operator panel | Reset, pause QR, trigger, preset plan, hide, and the planning ticker that keeps blocks replanning during moment 8 | Demo operation | Gate 2 |
| QR page | Opens the app with a device-bound account | Demo moment 8 | Gate 3 |
| Fallback video, two rehearsals, the clock rule call | In shared storage; in the chat | The pitch | Gate 3 |

## Not building
Comments, daily caps, ledger history page, separate inventory screen, incident report toggle, time slider, day/night clock. See docs/04 section 6.

## Suggested checklists

The stages below are one reasonable way to meet the contract. Reorder or replace steps freely as long as the outputs land by their gates.

### Stage 0
- [ ] Monorepo and packages layout from docs/05 section 2. Plain Next.js app deployed. PWA install is a Stage 1 task.
- [ ] Stub API behind `USE_FIXTURES=1` serving every fixture at the docs/02 section 8 routes that the script needs.
- [ ] `posts.seed.json` first cut: 3 posts per block, the demo block seeded sparse and calm, 3 explicit incident posts including the scripted one, 2 near-misses, one injection attempt. Grow to 6 to 10 per block during Stage 1. Seeded resident accounts with balances and one government account.
- [ ] Vercel project linked to the repo with Postgres and Blob. GitHub Projects board, one column per stage.

### Stage 1
- [ ] PWA install (manifest, icons, minimal service worker), tested on iOS Safari and Android Chrome.
- [ ] Orbit camera with clamps; block tap on mouse and phone with idle, hovered, selected states; camera framing on select; tap empty to deselect.
- [ ] Block panel: summary, mood, top tags, reasons, recent posts with photos.
- [ ] Post flow on a phone: camera capture or gallery, caption, device location with block-tap fallback, submit; text-only allowed; upload retry then text-only fallback.
- [ ] Like toggle on posts in the panel.
- [ ] Points toast and visible balance after post and like. Shop screen with inventory shown inline, over the Civic owner's game CRUD (stub against fixtures until it lands).
- [ ] Everything tested installed on a phone.

Gate 1 criteria you own: on a phone, a photo post round-trips through the stub, a like credits points, a purchase changes inventory.

### Stage 2
- [ ] Real endpoints. Post flow resolves and shows the community.
- [ ] "Why" panel with real reasons and posts.
- [ ] My-city mode: toggle; tap block to show its 3 slots; `slotTap` places the selected item or removes it; persisted per user; hidden in public view.
- [ ] Operator panel: reset (seed posts, plans, balances, placements, incident status), pause QR page, trigger planning for one block or all, the preset "festival plan" button for the demo block, a list of the latest posts with a one-tap hide, and the planning ticker: while the panel is open it calls `POST /api/plan/tick` every 10 seconds and shows the last tick's result. This ticker is the only thing that replans blocks during moment 8, so the panel stays open and the laptop stays awake.
- [ ] Scene polling of `GET /api/city/version` every 5 seconds; rebuild only changed blocks; after posting, highlight the user's block as "planning" until its plan id changes.
- [ ] Feed and panel show only analyzed, unhidden posts. A user's own pending post shows to them with a "being analyzed" state.

Gate 2 criteria you own: moments 2, 3, 5 run on a phone against the deployed build, operated by someone else.

### Stage 3
- [ ] Record the fallback video of moments 1 through 6 immediately after Gate 2. Upload to shared storage.
- [ ] QR page that opens the PWA with a device-bound account. Tested with four phones posting at once and on a throttled network. Every phone saw its block change without the operator touching anything.
- [ ] Hide-post rehearsed: post something, hide it from the operator panel, confirm it vanishes from every feed and the panel.
- [ ] Two full rehearsals with operator and phone holder swapped. Time them. Rehearse the preset plan button once as if the real plan had come back flat.
- [ ] Know the one clock rule in docs/04 section 9. You call it.

### Stage 4 (only after Gate 3, in docs/04 order)
- [ ] Panel and shop polish, empty states, block labels.
- [ ] README (four modules, two layers, "AI ends at JSON") and Devpost draft.

### Stage 5
- [ ] One more rehearsal on the frozen build. Screenshots. Submit.
