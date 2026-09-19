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
