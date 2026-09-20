# The signal layer

An Elasticsearch evidence index plus an agentic civic subsystem that reads it
and takes real actions on the incident list.

**The boundary, first.** The deterministic aggregator in `packages/pipeline`
remains the only input to planning. This layer reads the same `PostAnalysis`
records and writes nothing that Call B or the renderer reads. It sits behind
`SIGNAL_LAYER`, which is **off by default**. With the flag off, the post flow,
the aggregator, Call B and the renderer behave exactly as they did before this
layer existed, and demo moments 1 to 8 are unchanged.

Owned by the Civic role (`integration/EVENT-FACTS.md` decision 5). Code lives in
`packages/signal`, wired into the app through `apps/web/lib/signal.ts`.

## Is this one model call or several coordinating agents?

**It is one agent, in a tool-calling loop, making several model calls.** One
model, one system prompt, one conversation, deciding which tool to call next
until it has nothing left to do. There is no planner/worker split, no second
agent reviewing the first, and no message passing between roles. It does not
qualify as several coordinating agents and must not be entered anywhere as
such. The conflict resolution it acts on is not a model call at all — it is
deterministic code in `packages/signal/src/scoring.ts`, computed before the
agent is asked anything.

## Environment

Nothing below is read while `SIGNAL_LAYER` is off.

| Variable | Default | What it does |
|---|---|---|
| `SIGNAL_LAYER` | *(off)* | `on`, `1` or `true` enables the layer. Anything else, including unset, disables it. |
| `ELASTIC_URL` | *(empty)* | Cluster URL, no trailing slash. Empty means "no cluster", which is a fallback, not an error. |
| `ELASTIC_API_KEY` | *(empty)* | Sent as `Authorization: ApiKey …`. Optional for a local cluster. |
| `SIGNAL_INDEX` | `posts-signal` | Index name. |
| `SIGNAL_TIMEOUT_MS` | `4000` | Per-request timeout. Short on purpose: every call site has a fallback, so a slow cluster must lose the race quickly. |
| `SIGNAL_HEALTH_TTL_MS` | `10000` | How long a health verdict is cached. A dead cluster costs one timeout per ten seconds, not one per request. |
| `OPENAI_API_KEY` | *(empty)* | Reused from the pipeline. Absent means no embeddings and no agent; retrieval degrades to BM25. |
| `SIGNAL_EMBED_MODEL` | `text-embedding-3-small` | Embedding model. |
| `SIGNAL_EMBED_DIMS` | `1536` | Must match the mapping. Changing it means a reindex, not a redeploy. |
| `SIGNAL_AGENT_MODEL` | `gpt-4.1-mini` | The agent's model. |
| `SIGNAL_AGENT_CALLS_PER_MINUTE` | `6` | Hard cap over a rolling minute. The seventh run is refused, not queued. |
| `SIGNAL_AGENT_SPEND_CEILING_USD` | `2` | Latches when crossed: the agent stays disabled until the process restarts. |
| `SIGNAL_CONFIDENCE_FLOOR` | `55` | Below this the agent may only write a suggestion row. |
| `SIGNAL_AGENT_TIMEOUT_MS` | `25000` | Per model call. |
| `SIGNAL_PRICE_IN_PER_M` / `SIGNAL_PRICE_OUT_PER_M` | `0.4` / `1.6` | Per-million-token prices for the run log. **Check these against the provider's pricing page before the demo** — they exist so the ceiling has something to count, not as a guarantee. |

`.env.example` has not been updated, because it currently carries uncommitted
changes from the `pipeline/openai-provider` branch. Whoever merges that branch
should add the rows above.

## Running it

```bash
# once, to create the index (idempotent, safe to re-run)
pnpm signal:init

# index the seeded corpus
pnpm signal:backfill
```

`signal:init` creates `posts-signal` with one shard, no replicas, and a
1536-dimension cosine `dense_vector`. It **never rewrites an existing mapping** —
silently changing a mapping under a live index is how a demo loses its data
mid-rehearsal. `MAPPING_VERSION` marks when a reindex is needed.

`signal:backfill` pairs `posts.seed.json` with `post-analysis.mock.json`. It is
also the repair path: hidden posts are deleted from the index rather than
skipped, so a failed index write and a failed delete are both fixed by the next
run. To backfill the rows a *running* server holds, use the server-side
`runBackfill()` — analyses live in `apps/web/lib/pipeline.ts` module memory and a
separate CLI process cannot see them.

**One thing to know.** Analyses only exist when the pipeline is on
(`USE_FIXTURES=0` with a key). With fixtures serving, new posts produce no
analysis, so nothing is indexed from them and the seeded corpus from
`signal:backfill` is all there is. That is a property of the stub, not of this
layer.

## Turning it off

Unset `SIGNAL_LAYER`, or set it to anything other than `on`/`1`/`true`. Then:

- the post handler's `ingestAnalyzedPost(post)` returns immediately;
- the hide route's `removeFromSignal(id)` returns immediately;
- `/api/civic/signal/*` answer `404 SIGNAL_LAYER_OFF`;
- the panel on `/operator` collapses to one line of text;
- no env var is read, no index touched, no embedding generated, no agent run.

The five-tab bar, the post flow, the aggregator, Call B and the renderer are
untouched either way. There is no separate government page — the panel is on the
operator page, which judges never see (see the header comment on
`apps/web/app/operator/page.tsx`).

## What breaks if Elasticsearch dies

**Nothing.** That is the design, not an aspiration:

| Surface | With the cluster down |
|---|---|
| Creating a post | Succeeds. The index write is fire-and-forget and swallows its own errors; it is never awaited by the handler. |
| Hiding a post | Succeeds. The delete is awaited but cannot throw; the document is removed by the next backfill. |
| Trend panel | Falls back to the same store queries the rest of the app uses, and labels every figure `store fallback` with the reason. |
| Search | Falls back to a recency-ordered store scan, and says `mode: "fallback"`. It does not pretend to rank — without an index there is no relevance, and a fake ordering is a worse answer than an honest one. |
| Incident clusters | Falls back to clustering by block rather than by radius, and the panel says `by block, not radius (fallback)`. |
| The agent | Its read tools return the fallback results and say `degraded: true`, so it can say "I found nothing, and vectors were down" rather than "there is nothing". |
| Planning, Call B, the renderer | Never touched this layer at all. |

If embeddings are unavailable but the cluster is up, retrieval degrades to BM25
only and reports `mode: "bm25_only"` with the reason.

## The agent

Three read tools (`search_evidence`, `block_summary`, `lookup_incidents`) and six
writes (`file_incident`, `merge_duplicate_reports`, `raise_severity`,
`attach_corroborating_posts`, `flag_low_confidence`, `escalate_cluster`).

Four rules, enforced in `tools.ts` rather than in the prompt, because a rule that
lives in a prompt is a suggestion:

1. **Staff win.** A verified incident, one carrying a staff note, or one a staff
   member has explicitly locked is not the agent's to change. Reverting an agent
   action locks the row too, so the agent cannot redo on the next run what a
   person just undid.
2. **Every write is audited** in `agent_actions` with evidence post ids, a reason
   sentence and an undo payload. There is no code path that changes an incident
   without leaving a row.
3. **Every write is reversible** from the panel. Merging marks the losing rows
   rather than deleting them, precisely so it can be undone.
4. **Nothing planning reads is writable.** The port exposes incidents only — no
   posts, plans, placements or blocks.

Two deliberate asymmetries: `raise_severity` cannot *lower* a severity, because
an agent that can quietly downgrade an incident is a hazard; and
`flag_low_confidence` adds a flag rather than hiding anything, because an agent
that can make a resident's report vanish is a worse failure than one that
occasionally doubts a true report.

### Conflict and uncertainty

`resolveConflict` never discards the losing side. A claim's weight is
authenticity (linear) times recency (exponential, 30-minute half-life); a group's
weight is then multiplied by a log-scale factor over **distinct authors**, capped
at 1.7, so one person posting six times is one voice.

Worked example — two residents, same block, same window:

| Post | Says | Age | Authenticity | Confidence | Weight |
|---|---|---|---|---|---|
| `p-100` | flooding | 5 min | 85 | 80 | `0.85 × 2^(-5/30)` = **0.757** |
| `p-101` | none | 25 min | 60 | 70 | `0.60 × 2^(-25/30)` = **0.337** |

One author each, so no corroboration multiplier. Agreement is
`0.757 / 1.094` = **0.692**. Confidence is `80 × (0.5 + 0.5 × 0.692) × 1.0` =
**67.7**, which is above the floor of 55, so the agent may act — *and the dissent
is recorded on the incident*, not dropped. Had the two been evenly matched,
confidence would fall below the floor and the agent could only suggest.

The tie-break is total and deterministic: weight, then distinct authors, then the
most recent claim, then the lexicographically smallest post id. The last is
arbitrary on purpose — a rule, not a judgement, so the outcome is reproducible.

24 unit tests in `packages/signal/test/scoring.test.ts`, including the example
above and a check that reversing the input changes nothing.

## Security notes, stated plainly

- **No client talks to Elasticsearch.** Every query runs in a server route.
- **Raw coordinates never leave the server.** `location` is excluded from every
  `_source`, geo filtering happens inside the query, and the cluster endpoint
  returns block ids, counts and a radius.
- **`apps/web/lib/civic-gate.ts` is a gate in shape, not in strength.** It
  resolves a role and refuses anything that is not `government`, but it reads
  that role from a header or cookie a caller could set, because identity in this
  app is still `stub.ts`'s hard-coded resident and the real middleware is Civic's
  Stage 1 item. The existing civic routes are not gated at all, so this is not
  weaker than what it joins — it is the seam made explicit in one file. **It is
  not authentication.**

## REQUESTS for Pipeline

Contracts were not changed. Two fields would be better held there than derived
here:

1. **`PostAnalysis.authenticity` (0–100).** Currently derived in
   `packages/signal/src/doc.ts` from confidence, `about_location`,
   `incident.evidence`, image evidence and content flags. Call A could judge it
   directly and better.
2. **Incident annotations** — `corroborating_post_ids`, `merged_into`,
   `merged_incident_ids`, `dissent`, `confidence`, `escalated_at`,
   `low_confidence`. These live in `packages/signal/src/store.ts` beside the
   incident rather than on `Incident`, because `Incident` is Pipeline's shape.

Also worth Pipeline's attention: there is still no Postgres. `DATABASE_URL` is in
`.env.example` and nothing reads it, and both incident stores are module memory.
Agent writes therefore go through `packages/signal/src/ports.ts`, which is shaped
like the database boundary the same way `packages/civic/src/in-memory.ts` is.
When the migrations land, one implementation changes and nothing in
`packages/signal` moves.
