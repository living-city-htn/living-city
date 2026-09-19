# Team Workflow: Four People, Four Machines

Status: pre-hackathon planning draft, revision 2
Last updated: 2026-09-17

Goal: nobody's laptop is a bottleneck. Every module can be built and tested on its owner's machine without the other three modules existing yet. Integration happens through a shared GitHub repo, frozen contracts, and committed mock fixtures.

## 1. Setup before the match (allowed: accounts and access only, no code)

- Create an empty GitHub repo under one team member's account or a team org. Add all four as collaborators with write access.
- Everyone confirms locally: git, Node LTS, a package manager, and an editor. Everything is TypeScript.
- One person creates the Vercel project and links it to the repo so deploys come from GitHub, not from a laptop. Provision hosted Postgres and Blob storage from the Vercel Marketplace on the same project.
- Get a Gemini API key with billing enabled (the free tier's request rate will not survive judges posting at once). Put it in Vercel env and a shared password manager entry. Keys never go in the repo. No second provider this weekend.
- Everyone reads docs 01 to 05 and their own playbook in `docs/roles/`.

## 2. Repository layout and ownership

One monorepo. Each top-level package has exactly one owner. Owners may edit other packages only through a PR reviewed by that package's owner.

```
/
  docs/                  planning docs (this folder)
  packages/
    contracts/           TYPES ONLY: every shape in docs/02 section 7 and docs/03, as Zod
                         Owner: Pipeline. Changes need two approvals, all four after Gate 2.
    fixtures/            Mock data used by every module for offline development
                         Owner: Product, everyone contributes
    map/                 Module 1: the hand-drawn city (processed data), official polygons
                         for assignment, point-in-polygon
                         Owner: Map (Stage 0 and 1 only)
    pipeline/            Module 2 and 3: post intake, Call A, aggregator, Call B, validator,
                         tick and preset routes
                         Owner: Pipeline
    modeling/            Module 4: asset library manifest, taxonomy generator, placement
                         Owner: 3D
    game/                Likes, points ledger, shop, inventory, placements
                         Owner: Civic owner builds the CRUD, Product builds the screens, no AI
    civic/               Incidents and the government page (trends, weather, CSV: product scope, not this weekend)
                         Owner: Map from Stage 1 (becomes the Civic owner), no AI
  apps/
    web/                 Next.js PWA: 3D scene, post UI, feed, shop, my-city mode,
                         operator panel, government page, API routes
                         Owner: Product (scene by 3D; identity, game, civic routes and the
                         government page by Civic; post and plan routes by Pipeline)
```

The `contracts` package is the seam. If it compiles, everyone is speaking the same language.

## 3. Mock fixtures: the key to parallel work

Committed under `packages/fixtures/` during Stage 0. Hand-written, small, and versioned with the contracts.

| Fixture | Produced by | Unblocks |
|---|---|---|
| `city.json` (processed) | Map owner, the hand-drawn 12 to 20 block city with adjacency, capacity, and slots. Not a mock: this is the demo city | Everyone, from Stage 0 |
| `posts.seed.json` | Product owner, 6 to 10 KW posts per block for the capped block set, including 3 incident posts and 2 near-misses | Pipeline Call A testing, frontend feed |
| `post-analysis.mock.json` | Pipeline owner, hand-written expected Call A outputs for 10 posts | Aggregator, frontend "why" panel |
| `planning-input.mock.json` | Pipeline owner, one rich and one sparse example (from spec section 6) | Call B prompt work, validator tests |
| `plans.mock.json` | 3D owner, one valid plan per distinct archetype (4 or 5) plus the festival plan | Modeling and scene long before Call B works; the preset route |
| `taxonomy.v1.json` | 3D owner, generated from the asset manifest | Pipeline prompts, validator, shop catalog |
| `slots.json` | Map owner, 3 decoration slots per block, shipped with the city | Game layer, my-city mode, 3D rendering |
| `incidents.mock.json` | Civic owner, 3 incidents, one per status | Government page before Call A emits real ones |

Rule: if you are blocked on another module, you are allowed to write the fixture you need yourself, in the shape the contract defines, and commit it. Do not wait.

## 4. Contracts between people

Every playbook in `docs/roles/` opens with a contract: the inputs that person receives (from whom, in what shape, and what to use if it is late) and the outputs they owe (shape, consumer, gate). The contract is fixed. How they meet it is their call. The stage checklists after the contract are suggestions.

The rule when something breaks: if your input is late or wrong, use the fallback named in your contract and keep going. If your output will miss its gate, say so in chat before the gate, not at it. Nobody should ever be idle because someone else's step failed.

## 5. Who can work without whom

Dependencies are between stages, not times. Stages and gates are defined in docs/04.

| Owner | Can build independently with | First needs from others |
|---|---|---|
| Map, then Civic | A GeoJSON editor, the official files, Turf for point-in-polygon; then the manifest for the shop catalog | Pipeline's migrations at Stage 1 for the game CRUD. `PostAnalysis.incident` records from Pipeline at Stage 2. |
| Pipeline | `posts.seed.json`, `city.json`, a Gemini key | `taxonomy.v1.json` from 3D before Call B work (Stage 1). Assignment function from Civic at Stage 1. |
| 3D | `plans.mock.json`, `city.json`, `slots.json`, asset packs | Real plans from Pipeline at Stage 2. |
| Product | `city.json`, all mocks, the stub API | Game CRUD from Civic at Stage 1. Real API routes from Pipeline at Stage 2. Scene component from 3D at Stage 2. |

The stub API is worth its cost: a route handler flag such as `USE_FIXTURES=1` makes `apps/web` serve fixtures instead of calling the pipeline. Product and 3D develop against it through all of Stage 1.

## 6. Branch and merge rules

- `main` is always deployable. Vercel builds every push to `main` as production and every PR as a preview.
- Short-lived branches named `<owner>/<thing>`, for example `map/merge-datasets`. Merge as soon as a piece works, and at latest at every gate. Long branches are how hackathon teams lose a day to conflicts.
- PRs into `main` need one approval and a green build. Contract changes need approval from the Pipeline owner plus one other person, and all four after Gate 2.
- Rebase or merge `main` into your branch before opening a PR. The person who opens the PR resolves conflicts.
- No force pushes to `main`. No direct pushes to `main` after Gate 0.
- Commit messages start with the package name: `pipeline: validator clamps height tier`.

## 7. Gates

A gate is a short all-hands where the deployed preview is opened on one screen and the gate criteria from docs/04 are checked one by one. Gates are triggered by a person saying "I think we can pass Gate N", not by the clock.

| Gate | Ends stage | Locks |
|---|---|---|
| 0 | Scaffold | Direct pushes to `main` end |
| 1 | Slice parts | Fixture shapes; changing one now requires telling everyone |
| 2 | The demo runs once | Contracts frozen; schema changes need all four; fallback video recorded now |
| 3 | Protect the demo | Moment 4 tuning locked; any change to the demo path needs a rehearsal afterward |
| 4 | Widen within caps | Feature freeze; bugs and copy only |
| 5 | Submit | Submission |

If one owner reaches a gate while another has not, the finished owner pulls from their own next-stage list or the cut list. Gates are checked as a team but stage work is not synchronized.

A team chat channel keeps three pinned messages: the preview URL, the current gate, and the current cut list.

## 8. Secrets and environment

- `.env.example` committed with variable names only. Real values in Vercel and in each person's local `.env.local`, which is gitignored.
- Variables to expect: `GEMINI_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `USE_FIXTURES`, `CITY_ID=kw`.
- The Pipeline owner sets a spend alert on the Gemini key. Two calls with small models should stay well under it, but a runaway ticker should not be able to burn the budget.

## 9. Deployment

- Production deploys only from `main` via Vercel's GitHub integration. Nobody deploys from a laptop.
- Preview URLs are the shared demo surface during development. The demo itself runs on production `main` frozen at Gate 4.
- Backup: immediately after Gate 2, one person records a video of the full script on the deployed build and uploads it to shared storage. It is re-recorded after Gate 4 if the build improved.

## 10. Data and asset handling

- Official planning-area GeoJSON for Kitchener and Waterloo is downloaded once, checked into `packages/map/data/raw/` with a source note, and never edited by hand. It is used for assignment only. The hand-drawn city is checked into `packages/map/data/processed/` and is the visual layer.
- Asset packs are checked in under `packages/modeling/assets/` with their license file. Keep the total under a size that clones quickly, and prefer draco-compressed glTF.
- Fixtures are small on purpose. If a fixture grows past a few hundred lines, it is probably real data and belongs in a data folder.

## 11. Rhythm

- Standup at each gate, not on a clock. Three questions: what is merged, what is blocked, what is next.
- A blocked person does not wait. They write the fixture they need or take a later-stage item of their own, and say so in chat. They never start something from docs/04 section 6.
- Rest in shifts so that the Pipeline owner and the 3D owner are never both away once Stage 2 starts. Those two are the critical path, which is why the Map owner is freed from Stage 1 to take the CRUD work off Product and slots off 3D.
- Track tasks on a GitHub Projects board with one column per stage. Each card names an owner and, if it has one, the card it depends on. The board, not memory, answers "what is next".
