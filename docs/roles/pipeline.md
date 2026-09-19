# Role Playbook: Pipeline

You own the data behind moments 3, 4, and 6: upload, post analysis with incidents, aggregation, planning, validation, city routes, and the points credit hook. The validator is the safety net and is never cut. Moment 4 is the pitch; its tuning is yours.

Owned packages: `packages/pipeline`, `packages/contracts`, the city API routes in `apps/web`. Fixtures you produce: `post-analysis.mock.json`, `planning-input.mock.json`.

Read fully: docs/04, docs/03 (all), docs/02 sections 4.2 to 4.4, 6.1, 7, 8.

## Your contract

How you build it is yours. The inputs and outputs below are not. If an input is late, use the fallback in the table, keep the interface, and swap in the real thing when it lands.

Inputs:

| Input | From | Shape | If it is late |
|---|---|---|---|
| `posts.seed.json` | Product, Stage 0 | Posts with text, image URL, lon, lat, timestamp | Write 10 posts yourself in that shape |
| `taxonomy.v1.json` | 3D, Stage 0 | docs/03 section 5.4 | Hand-write a minimal one from docs/03 section 5.3 |
| `city.json` | Map, Stage 0 | `CommunityGeo[]` | Any 3 blocks in the right shape |
| `assignCommunity(lon, lat)` | Civic, Stage 1 | Function | Nearest centroid from `city.json` |
| `credit(user, reason, ref)` and `currentUser(req)` | Civic, Stage 1 | Functions | No-op credit that logs; a fixed test user |
| Gemini key with billing | Team, pre-match | Env var | You cannot proceed on Call A without it; do the aggregator and validator first |

Outputs:

| Output | Shape | Who needs it | When |
|---|---|---|---|
| `packages/contracts` | Zod schemas and types for every shape in docs/02 section 7 and docs/03 | Everyone | Gate 0 |
| Database migrations | Tables from docs/02 section 7 | Civic (game CRUD), Product | Stage 1, first thing |
| `PostAnalysis` per post | docs/03 section 3.1, stored, with `status` and `hidden` on the post | Civic, Product's panel | Stage 1 |
| `SemanticState` per community | docs/03 section 2.3 | Call B, Product's panel | Stage 1 |
| `CommunityPlan` per community, validated | docs/03 section 3.2 | 3D, Product | Gate 2 |
| Routes: `POST /api/posts` (inline Call A, credit, assignment), `GET /api/city`, `GET /api/posts`, `GET /api/communities/:id/plan`, `POST .../plan`, `POST /api/plan/tick`, `POST .../plan/preset` | docs/02 section 8 | Product, Civic | Gate 2 |
| Pending-until-analyzed, auto-hide on `unsafe`, concurrency guard, retries | docs/04 section 7 | Demo moment 8 | Gate 3 |

## Not building
A second model provider before Stage 4 item 7. Comments, daily caps, ledger history, weather polling, incident form handling, trend history hooks, CSV. See docs/04 section 6.

## Suggested checklists

The stages below are one reasonable way to meet the contract. Reorder or replace steps freely as long as the outputs land by their gates.

### Stage 0
- [ ] `packages/contracts` from docs/03 and docs/02 section 7: every schema and enum as Zod, exporting types and validators. Must compile.
- [ ] `.env.example` with `GEMINI_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `USE_FIXTURES`, `CITY_ID`.
- [ ] `post-analysis.mock.json` (10 expected outputs including one incident) and `planning-input.mock.json` (the rich and sparse examples from docs/03 section 6).
- [ ] One trivial Gemini call with the real `CommunityPlan` response schema. If the schema is rejected for nesting or size, flatten it now, before anyone builds against it.

### Stage 1
- [ ] Database migrations for docs/02 section 7 against the hosted Postgres (skip the comment and trend tables). Land these first; the game CRUD waits on them.
- [ ] Provider adapter interface: (system prompt, payload, schema) to validated JSON. One implementation this weekend: Gemini with response schema and image input, temperature 0. Keep the interface so a second provider is a one-file addition later.
- [ ] Photo upload route to Blob; post stores the URL.
- [ ] Call A prompt from docs/03 section 4.1 including incident rules 23 to 27. Fixed prefix, one post at the end (the prompt supports arrays; batching is product scope).
- [ ] Run Call A on the full seed set. Incidents present on the 3 seeded incident posts, absent on the near-misses. Log rejection rate and corrections.
- [ ] Aggregator: base weight 1 × confidence × relevance × `(1 + 0.5 × log(1 + likes))` × recency; exclude `unsafe`, halve flagged; null-aware means; window state, EMA baseline, trend, sufficiency, `consecutive_windows_supporting_change`.
- [ ] Post creation calls the Game layer's credit function (Civic owner provides it; stub it if not ready) and the assignment function (Civic owner provides it).

Gate 1 criterion you own: Call A output on the seed set is valid with correct incidents.

### Stage 2
- [ ] Call B prompt from docs/03 section 4.2; `PlanningInput` from real `CommunityGeo[]` and `taxonomy.v1.json`.
- [ ] Validator with every rule in docs/02 section 4.4. Log every correction. Previous-plan fallback proven by forcing a bad output.
- [ ] Plans for all blocks from the seed. Zero hard failures.
- [ ] Post and plan routes replace the stub. `POST /api/posts` runs Call A inline, assigns via the Civic owner's function, credits points. Posts are `pending` and invisible until analyzed. `unsafe` or a provider refusal sets `hidden = true, hidden_reason = 'auto'`. Input hashing per community.
- [ ] `POST /api/plan/tick`: replan changed-hash communities serially, lock row so two ticks cannot overlap, return. Manual trigger for one block and all.
- [ ] Preset plan route: `POST /api/communities/:id/plan/preset` writes a hand-written, validator-passing "festival plan" as the accepted plan for that block. Write the plan itself with 3D so it looks as loud as possible.
- [ ] Every feed query the Civic owner writes filters `hidden = false AND status = 'analyzed'`; you make sure aggregation and incidents also skip hidden posts.
- [ ] Moment 4 tuning: the demo block seeded sparse and calm; thresholds set so the one scripted post switches mood, lighting, effects, activity, and decorations, while archetype, density, and buildings hold. Prove it three times in a row after a reset.

Gate 2 criterion you own: moment 4 runs on the deployed build and the change is obvious from across a room.

### Stage 3
- [ ] Timeouts and one retry on upload and on both model calls; user-visible failure that still lets the post exist text-only.
- [ ] Concurrency guard on Call A sized to the provider's rate, so ten judges posting at once queue inside the handler rather than failing.
- [ ] Load test: four phones posting at once, all blocks change within two cadences.
- [ ] Billing enabled on the Gemini key. Written down in the team chat.
- [ ] Replay set recorded from real runs for both calls. Rerun after any prompt change.
- [ ] Spend alert on the Gemini key.

### Stage 4 (only after Gate 3)
- [ ] Nothing unless asked. Help 3D or Product. DeepSeek adapter only as docs/04 Stage 4 item 7.

### Stage 5
- [ ] Run the replay set once more on the frozen build.
