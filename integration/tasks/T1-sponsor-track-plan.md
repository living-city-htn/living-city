# T1: Sponsor track plan

**Wave:** 1 (blocking, run alone first)
**Time:** 60 minutes
**Writes:** `docs/06-sponsor-tracks.md` (new)
**Owner:** whoever owns architecture (Cris), reviewed by all four
**Blocks:** T2, T3, T4, T5, T6

## Why this is first
Every other task implements part of a track. This document decides which tracks are in, what each one costs, where in the stage plan it is allowed to start, and what happens to it if time runs out. Without it, four agents will each quietly expand the scope of a plan whose whole strength is scope control.

## What the document must contain
1. **The amended architectural rule**, stated once, precisely, in the pack's own language: no model call may sit between a post and a block rebuild except Call A and Call B. A third call is allowed only in the civic layer, off the critical path, behind a flag, after Gate 2. Explain why in two sentences, because `AGENTS.md` currently forbids it outright and T5 will amend that file to point here.
2. **One table row per committed track** with these columns: track, the exact requirement clause, the component that satisfies it, which existing demo moment it attaches to, the stage it may start in, the owner, the cost in owner-hours, and the flip-off behavior if it is not finished.
3. **The provider decision**, written as a short decision record: OpenAI as the single critical-path provider for Call A and Call B, Gemini documented but unbuilt, OMNI additive for voice only. Name the properties each call needs (enforced JSON schema, image input, temperature 0) and confirm OpenAI satisfies them. State the cost of losing the MLH Gemini prize.
4. **Per-post cost and latency delta** for each addition: GPTZero call, OMNI audio call, embedding write, civic subsystem call. Give numbers with their basis, and the total added latency on the critical path, which must be near zero for everything except the GPTZero call. Say explicitly whether GPTZero runs inline with Call A, in parallel with it, or after it, and what the post flow does while it waits.
5. **Track priority order**, so that when time runs out the team drops in a defined order. My recommendation to evaluate: Sentry and OpenAI are nearly free and go first; GPTZero next; OMNI voice next; Elastic plus Rox as one subsystem after Gate 2; openJiuwen selected only if that subsystem is genuinely multi-agent.
6. **The prize selection checklist** for the 2:00 PM Saturday deadline: each prize, one sentence of qualification, and the person who confirms it is true. Mark any prize that must not be selected if its work did not land, since selecting a prize we do not qualify for wastes a judge's time and reads badly.
7. **A do-not-build list** in the pack's style: things a sponsor track might tempt someone into that are still forbidden (a second critical-path provider, an agent that outputs geometry, model calls in the game layer, a chatbot UI, a dashboard nobody demos).

## Hard constraints
- The demo script and breadth caps do not change. If a track appears to need a new moment, record it as a conflict for the humans.
- Every track entry must have a flip-off path. A track that cannot be turned off without breaking the demo is not allowed.
- No track may put work on the Pipeline owner. Pipeline is the critical path.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, docs/README.md, docs/01-prd.md,
docs/02-architecture.md, docs/04-hackathon-plan.md, docs/05-team-workflow.md and AGENTS.md.

Task: write docs/06-sponsor-tracks.md, a new document in the same voice as the existing docs
(short declarative sentences, tables, numbers, no em dashes). It decides how Hack the North
2026 sponsor tracks attach to the Living City plan without changing the frozen demo script in
docs/04 section 2 or the breadth caps in section 3.

Include, in this order:
1. The amended architectural rule: no model call may sit between a post and a block rebuild
   except Call A and Call B; a third call is allowed only in the civic layer, off the critical
   path, behind a feature flag, after Gate 2. Two sentences of justification.
2. One table row per committed track (Rox, Elastic, Sentry, OpenAI plus Codex, GPTZero, Huawei
   OMNI Live, Huawei openJiuwen) with columns: track, exact requirement clause, component that
   satisfies it, which existing demo moment it attaches to, earliest stage it may start,
   owner, cost in owner-hours, and flip-off behavior if unfinished.
3. A decision record for the provider choice: OpenAI as the single critical-path provider for
   Call A and Call B, Gemini documented but unbuilt, OMNI additive for voice only. Name the
   properties each call needs and confirm OpenAI satisfies them. State what losing the MLH
   Gemini prize costs.
4. Per-post cost and latency deltas for the GPTZero call, the OMNI audio call, the embedding
   write and the civic subsystem call, with the basis for each number, and the total added
   critical-path latency. Say exactly where the GPTZero call runs relative to Call A and what
   the post flow shows while it waits.
5. A track priority order for when time runs out.
6. The 2:00 PM Saturday prize selection checklist: prize, one qualifying sentence, the person
   who confirms it, and which prizes must not be selected if their work did not land.
7. A do-not-build list in the style of docs/04 section 6.

Constraints: no track may add work to the Pipeline owner, every track must have a flip-off
path, and any track that seems to require a new demo moment is recorded as a conflict for the
humans rather than resolved. Put anything you assumed in an Assumptions section at the top.
```
