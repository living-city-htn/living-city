# T4: Observability, and the live surface that replaces the slide

**Wave:** 2 (parallel)
**Time:** 60 minutes
**Writes:** `docs/09-observability.md` (new)
**Owner:** Product owner, with Pipeline as reviewer
**Depends on:** T1

## Why this exists
Two reasons, in this order. First, the team will be debugging a multi-provider pipeline at 4am and the pack currently has no telemetry at all. Second, Devpost forbids a slide deck in the pitch, and moment 7 is currently a slide. The same Sentry data that solves the first problem replaces the slide with something live, and it satisfies the Sentry track, which needs two products beyond error monitoring plus evidence that observability shaped the build.

## What the document must contain
1. **Product selection.** Which Sentry products are used and the specific question each answers. At least three, chosen from Tracing, Logs, Session Replay, Profiling, Uptime Monitoring and AI agent monitoring. Rank them by value to the team, not by prize optics.
2. **Trace design for one post.** Named spans covering: client submit, upload, post handler, OMNI call when present, GPTZero call, Call A, points credit, aggregator recompute, tick, Call B, validator, plan store, version poll, block rebuild in the scene. State which spans are client-side and which are server-side, and how trace context is propagated from the phone through the route handlers. Attributes per span: block id, provider, model, latency, token usage, validator corrections, fallback used, whether the post had a photo or audio.
3. **AI monitoring.** What is recorded per model call, and the redaction rule for user content. Captions and transcripts can contain names and addresses, so define exactly what is truncated or hashed before it leaves the server.
4. **Logs.** Structured fields, levels, and the four log queries the team will actually run during the weekend. Write the queries, not a description of them. Examples worth including: posts still pending after 60 seconds, validator corrections in the last 10 minutes, plans rejected with the previous plan kept, model calls over budget latency.
5. **Session Replay.** Enabled on the phone post flow only. What is masked (photo previews, caption text, audio playback controls). The specific failure it exists to diagnose: a judge whose post did not appear and who has already walked away.
6. **Uptime monitoring.** Which endpoints and at what interval. The version endpoint and the post endpoint at minimum, since those two failing silently is the demo dying quietly.
7. **The live replacement for moment 7.** Specify the operator panel view shown for those 10 seconds: the last post's timeline with each stage and its duration, the two model calls with their validated outputs, and the validator's corrections. Say what the presenter says over it. This must work offline from Sentry as well, reading from the local call log, because the pitch cannot depend on a third-party dashboard loading on venue Wi-Fi.
8. **Spend visibility.** Where the operator sees provider spend and remaining credits, including the Huawei credit cap, and the threshold at which the panel turns red.
9. **The findings log.** The convention for `docs/sentry-findings.md`: one entry per real bug found through Sentry data, with the signal, the diagnosis, the fix and the commit. Three entries by Gate 3 is the target, because the track is judged on observability having shaped the build, and this file is the only evidence that survives to the submission.
10. **Sampling and cost.** Trace and replay sampling rates that keep the free tier alive through judging, and what is always sampled at 100 percent (errors, and any post that used a fallback).

## Hard constraints
- Instrumentation is added in Stage 0 and Stage 1, not retrofitted. Name the stage for each piece.
- No raw personal information leaves the server in telemetry.
- The pitch surface must render from local data with no external dashboard.
- A swallowed error in a catch block counts as a defect.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, docs/06-sponsor-tracks.md,
docs/02-architecture.md sections 3, 4.2, 4.4, 9 and 10, docs/04-hackathon-plan.md sections 2,
5, 7 and 8, and docs/05-team-workflow.md sections 2 and 8.

Task: write docs/09-observability.md in the same voice as the existing docs. It designs
observability for the Living City build, satisfies the Sentry track (at least two products
beyond error monitoring plus evidence that observability shaped the build), and replaces the
architecture slide in demo moment 7 with a live surface, because Devpost requires the pitch to
be a live demo rather than a slide deck.

Specify: which Sentry products are used and the question each answers, ranked by value to the
team; a full trace design for one post with named spans from client submit through upload, post
handler, optional OMNI call, GPTZero call, Call A, points credit, aggregator, tick, Call B,
validator, plan store, version poll and scene rebuild, saying which spans are client versus
server, how trace context propagates from the phone, and the attributes on each span; what is
recorded per model call for AI monitoring plus an exact redaction rule for captions and
transcripts that may contain names or addresses; structured log fields and levels plus four
real log queries written out; Session Replay on the phone post flow with what is masked and
the specific failure it diagnoses; uptime monitors for the version and post endpoints with
intervals; the operator panel view that replaces the slide for 10 seconds, including what the
presenter says over it and how it renders from local call-log data with no external dashboard;
where provider spend and remaining Huawei credits are visible and when the panel turns red;
the docs/sentry-findings.md convention with a target of three entries by Gate 3; and sampling
rates that keep the free tier alive, naming what is always sampled at 100 percent.

Constraints: instrumentation lands in Stage 0 and Stage 1 with the stage named per piece, no
raw personal information in telemetry, the pitch surface works without an external dashboard,
and a swallowed error counts as a defect. Assumptions section at the top.
```
