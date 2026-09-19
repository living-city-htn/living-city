# T6: Consistency audit and prize evidence map

**Wave:** 4 (last, run alone)
**Time:** 45 minutes
**Writes:** `docs/10-prize-evidence-map.md` (new) and `integration/AUDIT.md` (findings)
**Owner:** architecture owner (Cris)
**Depends on:** every other task

## Why this exists
Five agents will have written into one pack. This task is the acceptance test: it reads everything, proves the demo path is still intact, and produces the one document the team uses at 2:00 PM Saturday and again at submission. It fixes nothing. It reports.

## Part 1: the audit (`integration/AUDIT.md`)
Check and report pass or fail with the file and line for each:
1. The frozen script in `docs/04` section 2 differs from the original in exactly one place, moment 7.
2. Breadth caps in section 3 are unchanged.
3. No new model call sits between a post and a block rebuild. Walk the post path in the documents and list every call in order to prove it.
4. Every sponsor-track feature has a flip-off path, and the documents agree on the flag names.
5. Every new feature names an owner and a starting stage, and no new work landed on the Pipeline owner beyond the provider swap, the authenticity gate and trace spans.
6. Contract ownership is intact: nothing outside `packages/contracts` claims to change a shape Pipeline owns without recording it as a request.
7. The privacy boundary in `docs/02` is consistent with every endpoint listed in section 8 and with the signal layer's indices.
8. Latency: the sum of the added critical-path steps still fits the moment 4 budget in `docs/04` section 8. Show the arithmetic.
9. Cost: the per-post totals across all documents stay inside the stated provider budgets, including the Huawei credit cap.
10. Terminology: one name per concept across all documents. List every synonym found (for example community versus block versus district) and say which one wins.
11. Nothing in `docs/04` section 6 (not built) is contradicted elsewhere.
12. Gate criteria are checkable: each new criterion is a yes or no someone can verify on a deployed build, not a judgement call.

Rank findings as blocking, should-fix, or note. Do not edit the documents.

## Part 2: the prize evidence map (`docs/10-prize-evidence-map.md`)
One row per track: track, exact requirement clause, the component and document that satisfies it, the demo moment and its second, the evidence to capture during the build, and the gap with an owner and deadline stage if it is not fully satisfied.

Then four short sections:
1. **Selection checklist for 2:00 PM Saturday.** Each prize, one qualifying sentence, the person who confirms it, and the rule that a prize whose work did not land is not selected.
2. **Pitch timeline**, two and a half minutes, second by second, matching the frozen script, showing where each track's evidence appears. Live demo only. Flag any track with no on-stage moment and move its evidence to the written submission.
3. **Submission checklist.** Source code link, all design assets created at the event, the badge ID of every member exactly as printed under the QR code, the optional video, and the per-track written explanation. Name who owns each item.
4. **Honest risk note per track.** The single thing most likely to make a judge say we do not qualify, and our answer. Where there is no good answer, say so and recommend not selecting that prize.

## Hard constraints
- Report, do not fix. A finding with a file and line is more useful than a silent edit.
- No track may be claimed on a requirement the pack does not actually meet.
- If the audit finds a blocking issue, say plainly at the top of `AUDIT.md` that the pack is not ready to freeze.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, and every file in docs/ and
docs/roles/, plus AGENTS.md. You are auditing, not editing. Do not change any existing file.

Task 1: write integration/AUDIT.md. Check and report pass or fail with file and line for each
of: the frozen script differs from the original in exactly one place (moment 7); breadth caps
unchanged; no new model call sits between a post and a block rebuild, proven by walking the
post path and listing every call in order; every sponsor-track feature has a flip-off path and
the flag names agree across documents; every new feature names an owner and a starting stage
and no new work landed on Pipeline beyond the provider swap, the authenticity gate and trace
spans; contract ownership intact with no unrecorded shape changes; the privacy boundary
consistent with every endpoint and with the signal layer indices; the added critical-path
latency still fits the moment 4 budget, with the arithmetic shown; per-post cost inside the
stated provider budgets including the Huawei credit cap; one name per concept, listing every
synonym found and which wins; nothing in the not-built list contradicted elsewhere; and every
new gate criterion checkable as a yes or no on a deployed build. Rank each finding blocking,
should-fix or note. If anything is blocking, say at the top that the pack is not ready to
freeze.

Task 2: write docs/10-prize-evidence-map.md with one row per track (Finalist main award, Rox,
Elastic, Sentry, OpenAI plus Codex, GPTZero, Huawei OMNI Live, Huawei openJiuwen) containing
the exact requirement clause, the component and document that satisfies it, the demo moment and
second, the evidence to capture during the build, and any gap with an owner and deadline stage.
Then add: a 2:00 PM Saturday selection checklist with one qualifying sentence and a confirming
person per prize plus the rule that unlanded work is not selected; a second-by-second pitch
timeline of two and a half minutes matching the frozen script and showing where each track's
evidence appears, flagging any track with no on-stage moment and moving it to the written
submission; a submission checklist covering source code, design assets created at the event,
badge IDs exactly as printed under each member's QR code, the optional video and per-track
explanations, with an owner per item; and an honest risk note per track naming the single
thing most likely to disqualify us and our answer, recommending against selecting any prize
with no good answer.

Never claim a track on a requirement the pack does not meet. No em dashes.
```
