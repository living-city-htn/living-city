# Review of the Living City pack, and what to change

Reviewed: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01-prd.md`, `docs/02-architecture.md`, `docs/03-prompt-spec.md` (outline plus contracts), `docs/04-hackathon-plan.md`, `docs/05-team-workflow.md`, `docs/roles/*`.

Verdict: **this pack stays the main plan.** It is stronger than my earlier pack in the places that decide whether a hackathon team ships: a frozen demo script used as the build list, breadth caps with numbers, stage gates instead of clock milestones, one owner per package, committed fixtures so nobody waits, and a clean architectural rule ("AI ends at JSON"). It also already fixed two platform realities I had to discover separately: no long-running process on Vercel, so Call A runs inline and planning is driven by an operator ticker.

What follows is what I would change, in priority order. Nothing here touches the demo script.

## 1. The blind spot: zero sponsor coverage

The pack never mentions a sponsor, a prize or the submission mechanics. From the Devpost page, that is leaving the following on the table, and one of them is the largest cash prize at the event.

| Track | Prize | Fit with this plan as written |
|---|---|---|
| **Rox: Best AI Agent** | $10,000 / $2,000 | Requires agents on messy, conflicting, incomplete data that **take actions**. Resident posts are exactly that. Needs a small agentic subsystem the plan does not have. |
| **Elastic: Find the Signal** | Quest 3S / Bose | Requires Elasticsearch as an agent context layer with hybrid search, aggregations, geo and time queries. The civic layer is the natural home. |
| **Sentry** | Guaranteed interviews | Requires two products beyond error monitoring. Pure addition, no AI change, low cost. Best value per hour in the whole list. |
| **OpenAI API + Codex** | 3 prizes | Requires the OpenAI API to power the experience plus one concrete Codex contribution. Conflicts with the "Gemini only" decision, see tension 2. |
| **GPTZero** | AirPods Pro 3 + credits | AI-detection API used significantly. Fits the existing `flags` concept as an authenticity gate on resident reports. |
| **Huawei OMNI Live** | Watch GT 6 + office tour | Requires vision, audio **and** language through one OMNI model, end to end on an edge device. Needs voice posting, which the post flow does not have. |
| **Huawei openJiuwen** | Watch GT 6 + internship interview | Requires genuine multi-agent coordination, explicitly not chained prompts. Directly contradicts the two-call principle. See tension 1. |
| Warp, Expo, QNX, Dryft, Bracket Bot, CSE, Tether, Intact, Shopify, RBC | various | Each needs a different product. Correctly ignored. |

## 2. Factual corrections from the Devpost page

1. **The architecture slide is a rule violation risk.** Devpost: "Your judging pitch should be a live demo, not a slide deck or a product pitch." Moment 7 in the script is a slide. Replace it with the same content shown live: the operator panel's call log, or the Sentry trace of the judge's own post. Same 10 seconds, no slide.
2. **Sponsor prizes must be selected before 2:00 PM EDT Saturday.** That is a hard deadline earlier than submission and it appears nowhere in the stage plan. It belongs in Gate 2's criteria.
3. **Submission needs the badge ID of every team member, exactly as printed under the QR code on their badge, plus a link to all design assets created at the event.** The definition of done lists neither.
4. Judging criteria are WOW factor, technical ability, originality, design. The pack's instincts match these, so no change beyond keeping the live-demo rule.

## 3. Three real tensions, with my recommendation

**Tension 1: "exactly two AI calls" versus the agent tracks.**
The two-call principle is the best idea in the pack and it is why the demo will be stable. Rox and openJiuwen both reward more agents. Resolution: keep the principle for the **demo critical path**, and allow a third, clearly bounded call **only in the civic layer, off the critical path, behind a feature flag, and only after Gate 2**. The rule becomes: no model call may sit between a post and a block rebuild except Call A and Call B. That preserves the guarantee that matters (the block change never waits on anything new) while opening the $10K track. If the civic subsystem is not done, it flips off and the demo is unchanged.
On openJiuwen specifically: pursue it only if the civic subsystem ends up genuinely multi-agent (a retriever, a resolver, a filer that disagree and coordinate). If it stays a single call, do not select that prize. Do not multiply agents for a badge.

**Tension 2: "Gemini only" versus the OpenAI and OMNI tracks.**
"One tested provider" is correct engineering. But provider choice is now also a prize decision, and the pack chose Gemini for two properties (enforced response schema, native image input) that OpenAI also has. My recommendation: **make OpenAI the single critical-path provider** for Call A and Call B, which puts three OpenAI prizes in reach and costs nothing architecturally since the adapter is already provider-neutral. Keep Gemini as the documented alternate implementation, unbuilt. Then treat OMNI as an **additive perception step for voice only**: a voice post routes audio through OMNI, which returns a transcript plus audio cues that are folded into Call A's payload. Photo and text posts never touch OMNI, so the critical path still has one provider and one failure mode. If OMNI is down, voice falls back to browser speech input or to text, and the demo is unaffected.
Cost of losing the MLH Gemini prize: one swag kit. Cost of losing the OpenAI track: three prizes including dinner with their team.

**Tension 3: Elasticsearch versus the Pipeline owner's load.**
The pack correctly identifies Pipeline and 3D as the critical path and frees the Map owner to absorb CRUD work. Elasticsearch must not land on Pipeline. Assign the whole signal layer to the **Civic owner**, reading the same `PostAnalysis` records the aggregator reads, writing nothing the aggregator depends on. The deterministic aggregator stays authoritative for planning. Elasticsearch powers civic search, trends and the agentic subsystem only.

## 4. Smaller gaps worth fixing

| Gap | Why it matters | Where it lands |
|---|---|---|
| No observability design | Sentry track needs tracing plus AI monitoring plus one more product, and the team needs traces at 4am. Also replaces the banned slide. | New doc, T4 |
| No privacy boundary statement | `Post` stores raw `lon, lat` and feeds serve posts. Nothing says what a public read may never return. A judge asking "can I see where someone posted from" should get a clean answer. | T5 patches, one paragraph in the architecture doc |
| No cost or capacity numbers | The plan says "negligible" for AI cost and relies on billing being on. With a third call plus audio plus judges posting, that needs one table. | T1 includes a per-post cost line per track; T4 makes spend observable |
| No automated tests or CI | Gates, replay sets and rehearsals carry most of the weight, which is defensible for 36 hours. One typecheck-and-validate CI job on PRs is still worth the 20 minutes, since contracts are the seam. | T5 patches team workflow |
| Codex evidence not captured | The OpenAI track asks for one concrete way Codex helped. Nobody remembers this at hour 34. | T5 adds `docs/codex-log.md` convention |
| Moment 4 latency worst case 28 seconds | Correctly identified and mitigated with the manual trigger. Keep. My only note: rehearse the case where a judge posts while the operator is mid-sentence. | T5 adds a rehearsal line |

## 5. What I am deliberately not changing

- The demo script, the breadth caps, the stage and gate structure, the one-question cut rule, role ownership, the fixture strategy, the hand-drawn visual layer, the clipped-grid placement, the operator ticker, the preset festival plan, the pending-until-analyzed and hide-post fuses.
- Kitchener-Waterloo as the city. My earlier pack used the campus. Theirs is better: a recognizable city outline is a stronger opening moment than a campus, and the civic layer only makes sense at city scale.
- The two-layer public and personal split, and the rule that personal placements never touch geometry.
