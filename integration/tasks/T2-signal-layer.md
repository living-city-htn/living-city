# T2: Signal layer and the agentic civic subsystem (Elastic plus Rox)

**Wave:** 2 (parallel)
**Time:** 90 minutes
**Writes:** `docs/07-signal-layer.md` (new)
**Owner:** Civic owner (the Map owner after Stage 1)
**Depends on:** T1

## Why this exists
This is the $10,000 track and the Elastic track in one subsystem. Both reward the same thing: messy human reports turned into something an agent can act on. The pack already produces the raw material (`PostAnalysis` records with confidence, flags, tags and incidents) and already has a civic layer with no AI in it. This task designs the layer that sits beside the deterministic aggregator, never in front of it.

## What the document must contain
1. **Boundary statement, first paragraph.** The deterministic aggregator remains the only input to planning. The signal layer reads the same `PostAnalysis` rows and writes nothing that Call B or the renderer depends on. Behind `SIGNAL_LAYER=on`. If the flag is off, moments 1 through 8 are unchanged.
2. **Elasticsearch index design.** Index name, mapping and field types for post text, caption, analysis summary, tags, dimensions, confidence, flags, authenticity score, `geo_point`, official area id, drawn block id, incident type and severity, and timestamps. Shard count for this scale. Say which fields are searchable and which exist only for aggregation.
3. **Ingest path.** Where a document is written (the same handler that stores `PostAnalysis`, or a follower that reads the table), what happens on an Elasticsearch failure (the post must still succeed), and how a hidden post is removed from the index within one tick.
4. **Hybrid retrieval.** The actual query for "recent evidence about this block": BM25 over text and summary, dense vector over the summary, combined with RRF or weighted scoring, then reranking. Name the embedding model and dimension, where embeddings are generated, and the degrade path to BM25 only.
5. **Aggregations and ES|QL.** The aggregation behind the civic trend panel (dimensions and post volume per block per window), plus at least two ES|QL queries that both earn the track and power something a judge can see, for example "blocks whose stress rose fastest in the last hour" and "incident clusters within 500 m in the last 24 hours". Say where each result is displayed.
6. **The agentic subsystem, concretely.** This is what Rox judges. Specify:
   - The tool surface the agent may call, with parameters and return shapes: hybrid search, block aggregation, incident lookup, and the action tools.
   - The actions it may take, each one a real write: file an incident from a post that Call A did not mark, merge duplicate reports of the same event, raise a severity, attach corroborating posts to an existing incident, flag a report as low confidence, escalate a cluster to the top of the civic page. Every action is reversible by staff.
   - **Conflict resolution**, with a worked numeric example: two residents report contradictory things about the same block in the same window, weighted by recency, authenticity and corroboration count, producing a verdict that records the dissent instead of hiding it, plus the tie-breaking rule.
   - **Uncertainty**, with a formula: how per-post confidence and corroboration produce an incident confidence, and the floor below which the agent may only suggest rather than act.
   - **Error handling:** tool error, empty retrieval, malformed output, and an action that conflicts with a staff decision (staff always wins).
   - Whether this is one call or several coordinating agents. Decide honestly. If it stays one call, say plainly that the openJiuwen prize must not be selected.
7. **What the judge sees.** The civic page changes this subsystem produces, attached to demo moment 6, in 15 seconds or less: the scripted incident, a duplicate merged into it, a corroboration count, and a dissent note. No new moment.
8. **Cost, latency and caps.** Per-call cost, how often it runs (on demand from the civic page, or on the same operator ticker), a hard cap on calls per minute, and its total spend ceiling.

## Hard constraints
- Nothing in this document may change `packages/contracts` shapes that Pipeline owns. If a new field is needed on `PostAnalysis`, record it as a request, not a change.
- No client queries Elasticsearch directly.
- No raw coordinates leave the server.
- If Elasticsearch is unreachable, the civic page falls back to the existing database queries and the demo is unaffected.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, docs/06-sponsor-tracks.md,
docs/02-architecture.md sections 4.3, 4.7, 5, 7 and 8, docs/03-prompt-spec.md section 3.1, and
docs/04-hackathon-plan.md sections 2, 3 and 6.

Task: write docs/07-signal-layer.md in the same voice as the existing docs, designing the
Elasticsearch signal layer and the agentic civic subsystem that together satisfy the Elastic
"Find the Signal" and Rox "Best AI Agent" tracks.

Open with a boundary statement: the deterministic aggregator remains the only input to
planning, this layer reads the same PostAnalysis rows, writes nothing Call B or the renderer
depends on, and sits behind a SIGNAL_LAYER flag that leaves moments 1 to 8 unchanged when off.

Then specify: the Elasticsearch index name, mapping and field types covering text, caption,
summary, tags, dimensions, confidence, flags, authenticity score, geo_point, official area id,
drawn block id, incident type and severity and timestamps, with shard count and which fields
are searchable versus aggregation only; the ingest path including behavior when Elasticsearch
fails (the post must still succeed) and how a hidden post leaves the index within one tick; a
hybrid retrieval query combining BM25 and dense vectors with RRF or weighted scoring plus
reranking, naming the embedding model and dimension and the degrade path to BM25 only; the
aggregation behind a civic trend panel plus at least two ES|QL queries that power something a
judge can see, saying where each is displayed; and the agentic subsystem in full.

For the agentic subsystem give: the tool surface with parameters and return shapes; the list of
real write actions it may take (file an incident Call A missed, merge duplicate reports, raise
severity, attach corroborating posts, flag low confidence, escalate a cluster), all reversible
by staff; a conflict resolution algorithm with a worked numeric example using two contradictory
reports about the same block in the same window, weighted by recency, authenticity and
corroboration, producing a verdict that records dissent, with a tie-breaking rule; an
uncertainty formula and the confidence floor below which the agent may only suggest; error
handling for tool errors, empty retrieval, malformed output, and conflicts with staff
decisions where staff always win; and an honest decision on whether this is one call or several
coordinating agents, stating plainly that the openJiuwen prize must not be selected if it
stays one call.

Finish with what the judge sees on the civic page in 15 seconds attached to existing demo
moment 6, and with cost, run frequency, a calls-per-minute cap and a spend ceiling.

Constraints: do not change contracts Pipeline owns (record field requests instead), no client
queries Elasticsearch directly, no raw coordinates leave the server, and the civic page falls
back to database queries when Elasticsearch is down. Assumptions section at the top.
```
