# @living-city/web

Next.js PWA: the 3D scene, post UI, feed, shop, my-city mode, operator panel,
government page, and all API routes.

**Owner: Product**, with these carve-outs (docs/05 section 2):

| Path | Owner |
|---|---|
| `scene/` | 3D |
| identity, game, civic routes and the government page | Civic |
| post and plan routes | Pipeline |

Everything else in this app is Product's.

## Running it

```bash
pnpm install
pnpm --filter @living-city/web dev
```

`USE_FIXTURES` defaults to on, so every route in docs/02 section 8 serves
fixtures from `packages/fixtures` and nothing calls a model or a database. Set
`USE_FIXTURES=0` only once Pipeline's routes exist.

**Stub writes do not persist.** The store is a module-level object in one
process's memory, so it resets on every HMR reload locally, and deployed it is
per-invocation: a like or a purchase may not be visible to the next request.
Reads are stable, which is all Stage 1 needs against fixtures. Writes become
real when Civic's game CRUD lands on Postgres (docs/02 section 6).

To pull the real environment locally: `pnpm dlx vercel env pull`. That writes a
gitignored `.env.local`; never commit one.

## Deployment

| | |
|---|---|
| Live | https://living-city-delta.vercel.app |
| Vercel project | `bryan-kuangs-projects/living-city` |
| Root Directory | `apps/web` (Vercel installs at the workspace root on its own) |
| Production | pushes to `main` |
| Preview | every PR |

Deploys come from GitHub, not from a laptop (docs/05 section 9). Do not run
`vercel deploy` by hand.

Provisioned on the project, with variables set for production, preview and
development:

| Variable | Source |
|---|---|
| `DATABASE_URL` (plus Neon's `POSTGRES_*` aliases) | Neon, Vercel Marketplace |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store `living-city-photos`, public access |
| `USE_FIXTURES`, `CITY_ID` | set by hand |
| `GEMINI_API_KEY` | **not set yet** — Pipeline owns it, needs billing enabled |

The blob store is public because post photos are shown in the feed, the block
panel and the government page; private storage would mean signed URLs on every
image, which is not in the demo script.

## Phone posting (Product, Stage 1)

The Post tab supports camera/gallery photos, optional captions for photos,
text-only posts, device location, a community picker, and picking a block on
the map. Device location selects and names the nearest demo community before
submission, using the same lookup as the post route, while retaining the GPS
coordinates. Users can override that selection. The draft stays mounted across tabs and survives a failed request;
it does not survive a page reload. A successful response names the assigned
community and reports the credited points and balance from that request.

With `USE_FIXTURES=1`, photos are resized to at most 1280px, encoded as JPEG,
and sent inline in the existing `image_url` field. This is a disposable fixture
transport, not a Blob upload. In real mode, inline photos are rejected before
creating a post; the form offers an explicit caption-only fallback. Pipeline
must replace this transport with durable photo upload before Gate 2.
The existing fixture store remains in memory and can reset between requests.

Post-route changes require Pipeline-owner review. No contracts were changed.
Physical iOS/Android camera and installation tests remain Gate 1 checks.

## Shop (Product, Stage 1)

The Shop tab loads the six-item catalog and account together from `/api/shop`
and `/api/me`. It shows prices, current points and owned quantities inline.
A confirmed `/api/shop/buy` response updates the displayed balance and adds
one owned unit. Unaffordable items show the remaining points needed.
The account and inventory refresh when reopening the shop.

A purchase lock remains active across tab switches and blocks double taps.
Rejected or uncertain requests do not change the displayed inventory and
require a refresh before buying again. Purchases are never retried automatically.
The screen uses existing APIs; no Civic routes or shared contracts were changed.
Durable inventory still depends on Civic's database-backed game service: the
current fixture store is only process memory.

Local mobile-width tests cover buying, double taps, insufficient points,
failed requests and refresh recovery.

## My City placement (Product, Stage 2)

Pick an owned item in the My City tray, then tap an empty slot on any block to
place it. Tapping a filled slot takes the item back. One slot, both directions,
because PRD 8.12 makes the slot marker the touch target rather than a control
in a list.

While the tab is open the map's box stops above the sheet, so every slot stays
tappable instead of sitting behind it. That is plain CSS on the viewport, not a
scene prop, so 3D's component inherits the same behaviour.

A placement moves a unit between inventory and a slot, both owned by the
server, so writes are never retried automatically. A response that cannot be
trusted - a 5xx, a dropped connection, or a confirmation with no placement id
to remove later - leaves the screen unchanged and asks for a refresh. After
every confirmed write the screen re-reads `/api/me` and `/api/me/placements`
rather than guessing the new state.

Placements are private: the scene draws them only in My City mode, and no route
returns another user's. Nothing here can change a public plan or a block's
geometry.

Slot markers carry a role and a label naming the block, the slot and what it
holds, so they are reachable without sight of the map.

## Operator panel (Product, Stage 2)

At `/operator`, deliberately not a tab: judges never see it, so it stays off
the five-tab bar.

Its most important job is the planning ticker. There is no long-running process
on Vercel, so nothing replans a block unless this page is open calling
`POST /api/plan/tick` every ten seconds (docs/04 section 7). Closing the page is
the intended off switch, and the header says out loud whether the ticker is on.
**Keep it open and keep the laptop awake during moment 8.**

Also here: the preset festival plan for the demo block (the fuse for moment 4
when a real plan comes back flat), replan one block or all of them, the live
plan id per block, the latest posts with a one-tap hide, and a reset behind a
confirm because it discards everything a judge did. A timestamped log records
what was pressed, which matters when something looks wrong mid-demo.

Nothing retries on its own. During moment 8 a silent retry of a plan trigger
would burn model budget, and a silent retry of a reset would wipe a judge's
post twice.

Not here yet: pausing the QR page, which lands with the QR page itself in
Stage 3 — there is nothing to pause until then.

Handoff: placement is verified end to end against the stub - buy, place, switch
to City and see it gone, switch back, take it back. Durable placements still
wait on Civic's database-backed game service. Physical-phone checks remain open
for Product's Gate 1. Next on Product's list is the QR page (Stage 3), which
also brings the operator panel's "pause QR" control.

## Live update (Product, Stage 2)

The app polls `GET /api/city/version` every 5 seconds and re-fetches only the
plans whose id changed (docs/02 section 10). No server push. This is what lets
a judge watch their own block change without anyone touching the operator
laptop, which is all of moment 8.

After posting, the poster's block is marked "planning" so they know where to
look and that it takes a moment. The mark clears when that block's plan id
actually changes, not on a timer.

Polling pauses while the document is hidden and runs again immediately on
`visibilitychange`: a phone in a pocket should not be fetching. Note the
asymmetry with the operator panel, which has **no** visibility guard on
purpose - its ticker has to keep running when the operator switches tabs,
because it is the only thing replanning blocks during moment 8.

A block missing from a version response is left alone rather than blanked, so a
partial response can never wipe the block someone is looking at. A failed poll
is silent: the next one is five seconds away and the city on screen is still
valid.

The fallback scene maps `sunset_orange`, the festival plan's palette. It was
falling through to neutral grey, which made the demo block the dullest thing on
screen at the moment it is supposed to be the loudest.
