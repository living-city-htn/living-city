# Living City

A city that rebuilds itself from what people post about it.
Hack the North 2026. Demo city: Kitchener-Waterloo.

**The one rule:** AI interprets reality and plans visual intent. AI ends at structured JSON.
Everything geometric, procedural, rendered, scored, sold, placed, or reported is deterministic code.

## Getting started

```bash
corepack enable          # once, gives you pnpm
pnpm install
cp .env.example .env.local
pnpm dev
```

`USE_FIXTURES=1` is the default in `.env.example`, so the app runs offline against
fixtures with no API keys. Real keys are only needed once the pipeline is live.

## Layout

| Path | What | Owner |
|---|---|---|
| `packages/contracts` | Every shape as Zod. The seam. | Pipeline |
| `packages/fixtures` | Mock data for offline development | Product |
| `packages/map` | Hand-drawn city, official polygons, point-in-polygon | Map |
| `packages/pipeline` | Post intake, Call A, aggregator, Call B, validator | Pipeline |
| `packages/modeling` | Asset manifest, taxonomy generator, placement | 3D |
| `packages/game` | Likes, points, shop, inventory, placements | Civic (CRUD) + Product (screens) |
| `packages/civic` | Incidents, government page | Civic |
| `apps/web` | Next.js PWA, scene, API routes | Product, with carve-outs |

Only the owner edits a package directly. Anyone else goes through a PR the owner reviews.
`packages/contracts` needs two approvals, all four after Gate 2.

## Docs

Planning docs live in [`docs/`](docs/). Start with [`docs/README.md`](docs/README.md).
Then your own playbook in [`docs/roles/`](docs/roles/).

Working with an AI assistant? It reads [`AGENTS.md`](AGENTS.md) at the root.

## Branches

`<role>/<thing>`. Open a PR when a piece works. No direct pushes to `main` after Gate 0.
