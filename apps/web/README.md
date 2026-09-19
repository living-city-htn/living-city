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

**Stub writes are durable when `DATABASE_URL` is set.** The whole state travels
as one JSONB row in Neon (`demo_state`), loaded per request and saved after each
mutation, so every serverless instance sees the same city. Without a database it
falls back to module memory, which is fine for local work.

This exists because rehearsing moment 8 on the deployed build failed: state
lived in one instance's memory, so a judge's post landed in one instance and
their phone read another — the operator pressed the preset and it never reached
the phone.

- Writes go through `write()`, which re-runs the mutation against fresh state if
  someone else wrote first. Two judges posting in the same second is the case
  that protects.
- Reads go through `read()`. Touching the store outside either one sees whatever
  that instance last loaded.
- One row per environment (production, preview, development), so a rehearsal on
  a laptop cannot overwrite the city the judges are looking at.

This is Product's stub getting honest about serverless, not Civic's game
service. When their Postgres-backed CRUD lands it replaces this; the store's
signatures do not change either way.

To pull the real environment locally:

```bash
pnpm dlx vercel env pull apps/web/.env.local
```

**The path matters.** Next reads env files from the Next project root, which is
`apps/web`, not the repo root. A `.env.local` at the root is silently ignored,
and the store quietly falls back to memory as if no database existed — which
looks exactly like the bug it is there to fix. Never commit one; `.env*` is
gitignored.

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
| `OPENAI_API_KEY` | **not set yet** — Pipeline owns it, needs billing enabled |

The blob store is public because post photos are shown in the feed, the block
panel and the government page; private storage would mean signed URLs on every
image, which is not in the demo script.

## Phone posting (Product, Stage 1, rebuilt in Stage 2)

The Post tab opens the way a camera app opens: the capture is the screen, not a
field on a form. Three states — `choose` (camera first, with a way out to text
only), `compose` (the photo, then a caption, then where it happened), and a
collapsed bar while picking a block so the map underneath stays tappable.

Pull the grabber down past 120px to close. The gesture starts on the grabber
only, because anywhere else it fights the caption field and the scrolling body.
The composer stops above the tab bar rather than covering it: the grabber is
the intended way out, but moment 8 hands this to strangers and a gesture that
does not land must never trap someone on a screen with no visible exit.

Everything the earlier form did is kept — see below.

### The original notes still apply

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
for Product's Gate 1. With the QR page in, what is left on Product's list needs
the team: the fallback video and two rehearsals, both after Gate 2.

## Live update (Product, Stage 2)

The app polls `GET /api/city/version` every 5 seconds and re-fetches only the
plans whose id changed (docs/02 section 10). No server push. This is what lets
a judge watch their own block change without anyone touching the operator
laptop, which is all of moment 8.

After posting, the poster's block is marked "planning" so they know where to
look and that it takes a moment. The mark clears when that block's plan id
actually changes, not on a timer.

Polling runs unconditionally, including while the tab is hidden. An earlier
version paused on `document.hidden` to spare a phone's battery. That was an
optimisation nobody asked for and a real demo risk: a city view sitting in a
background tab while a projector shows it would silently stop updating in the
middle of moment 4. The endpoint is a plan-id map, the cost is nothing, and a
missed update on stage is everything. `visibilitychange` still forces an
immediate poll so a laptop waking from sleep catches up at once.

The operator panel's ticker has never had a visibility guard, for the same
reason: it has to keep running when the operator switches tabs, because it is
the only thing replanning blocks during moment 8.

A block missing from a version response is left alone rather than blanked, so a
partial response can never wipe the block someone is looking at. A failed poll
is silent: the next one is five seconds away and the city on screen is still
valid.

The fallback scene maps `sunset_orange`, the festival plan's palette. It was
falling through to neutral grey, which made the demo block the dullest thing on
screen at the moment it is supposed to be the loudest.

## QR page (Product, Stage 3)

`/qr`, shown on the laptop or projector for moment 8. The code points at
`window.location.origin`, so a preview build advertises itself and production
advertises itself, with nothing hardcoded.

The operator can pause it from `/operator`; the page polls that state every
5 seconds and swaps the code for a short "back in a moment" card. This is
**volume throttling, not a safety fuse** - the fuse for a bad post is hide-post,
which is a real write. The pause flag lives in the same process memory as the
rest of the stub, so a cold process or a reset starts unpaused. The operator
panel therefore shows the live value rather than its own idea of it, and the
operator can see that it flipped back.

Identity is still Civic's: judges land as the stub's fixed user until the
device-bound account middleware lands. Nothing on this page changes when it
does.
