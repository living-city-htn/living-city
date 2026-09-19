# T5: Patch the existing plan (stages, workflow, agent rules, roles, README)

**Wave:** 3 (after T2, T3 and T4 merge)
**Time:** 75 minutes
**Patches:** `docs/04-hackathon-plan.md`, `docs/05-team-workflow.md`, `AGENTS.md`, `docs/README.md`, `docs/roles/*.md`, and one paragraph in `docs/02-architecture.md`
**Owner:** architecture owner (Cris)
**Depends on:** T1, T2, T3, T4

## Why this exists
Three new documents are worthless if the stage plan, the agent onboarding file and the role playbooks still say the old thing. `AGENTS.md` currently forbids a third model call and a second provider outright, which would make any AI assistant refuse this work. This task makes the pack internally consistent again, using surgical edits rather than rewrites.

## Edits to make, file by file

### `AGENTS.md`
- Add the new documents to the reading list in section 1, with the same "read only your part" discipline: all roles read `docs/06`, the Civic owner reads `docs/07`, Pipeline and Product read `docs/08`, Product and Pipeline read `docs/09`.
- Amend section 4's rule so it matches the decision in `docs/06`: the two-call rule now applies to the path between a post and a block rebuild; a third call is allowed in the civic layer only, behind the flag, after Gate 2. Keep the original spirit visible so the amendment reads as a narrowing, not a loosening.
- Amend the one-provider rule: OpenAI is the critical-path provider, OMNI is permitted for voice only, no other provider before Stage 4.
- Add one line: log Codex contributions to `docs/codex-log.md` when they are substantial, because the OpenAI track asks for a concrete example and nobody will remember at hour 34.
- Add one line to section 6: a task that only serves a sponsor track still has to name the demo moment it attaches to.

### `docs/04-hackathon-plan.md`
- Moment 7 in the frozen script: replace "A slide" with the live operator view from `docs/09`. This is the one script edit allowed, and it is a rule compliance fix, not scope.
- Moment 3 and moment 8: add voice as an optional input and the authenticity gate, per `docs/08`.
- Moment 6: add the signal layer's visible effect, per `docs/07`, still inside its 15 seconds.
- Stage 0: Sentry project and SDK in the web app, OpenAI key with billing, Huawei and GPTZero keys, Elastic deployment created. Keys only, no feature work.
- Stage 1: tracing spans on the post path, the authenticity gate, voice capture UI behind a flag.
- Stage 2: add to the gate criteria "sponsor prizes selected on Devpost before 2:00 PM Saturday" and "badge IDs collected from all four members".
- Stage 3: OMNI voice path rehearsed with venue noise; the signal layer flipped off and the whole script re-run to prove independence.
- Stage 4: the signal layer and openJiuwen evaluation take the place of the old item 7 (the DeepSeek adapter), which is dropped.
- Section 6 (not built): keep everything, and add the items from `docs/06`'s do-not-build list.
- Section 10 risk register: add rows for OMNI credits exhausted, GPTZero false positive on a real resident's post, Elasticsearch unreachable, a sponsor prize selected but unqualified, and the operator panel being the only live surface during moment 7.
- Section 11 definition of done: add the badge IDs, the design-assets link, `docs/codex-log.md`, and three entries in `docs/sentry-findings.md`.

### `docs/05-team-workflow.md`
- Section 1: add the new accounts and keys to the pre-event list.
- Section 2: add `packages/signal/` owned by the Civic owner, and name the owner of the observability code.
- Section 3: add the new fixtures from `docs/07` and `docs/08`.
- Section 8: add the new environment variable names, including the signal layer flag.
- Add a short subsection: one CI job on pull requests running typecheck plus fixture validation, since `contracts` is the seam and a broken fixture is a silent Stage 2 failure.
- Section 11 rhythm: note that the Civic owner now carries the signal layer, so the load rebalancing rule needs one more sentence about what Civic drops first if Pipeline falls behind.

### `docs/roles/*.md`
One block per role, appended to the contract section, naming only that role's new duties: Civic gets the signal layer and the flag; Pipeline gets the provider swap, the authenticity gate and the trace spans; Product gets voice capture, the operator live view, replay and the panel's spend display; 3D gets nothing new, which should be stated explicitly so the 3D owner does not go looking.

### `docs/02-architecture.md`
Add one short subsection stating the privacy boundary: which fields a public read may never return (raw `lon`, `lat`, `user_id`, audio URLs), what the feed and panel return instead, and that the civic page is role-gated. Change nothing else in that file.

## Hard constraints
- Surgical edits. Do not rewrite sections that do not need changing, and do not restate the new documents inside the old ones. Link to them.
- The frozen script changes in exactly one place, moment 7, for rule compliance.
- Breadth caps are untouched.
- Every added task must name the stage it starts in and its owner.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, docs/06-sponsor-tracks.md,
docs/07-signal-layer.md, docs/08-voice-and-authenticity.md, docs/09-observability.md, then
AGENTS.md, docs/README.md, docs/02-architecture.md, docs/04-hackathon-plan.md,
docs/05-team-workflow.md and all four files in docs/roles/.

Task: patch the existing pack so it is internally consistent with the four new documents. Make
surgical edits only. Do not rewrite sections that do not need changing and do not restate new
documents inside old ones; link to them instead. Keep the existing voice and avoid em dashes.

Edit AGENTS.md: add the new documents to the section 1 reading list with per-role scoping;
amend the two-call rule so it applies to the path between a post and a block rebuild, with a
third call allowed in the civic layer only, behind the flag, after Gate 2, written as a
narrowing rather than a loosening; amend the one-provider rule to name OpenAI as the
critical-path provider with OMNI permitted for voice only; add a line about logging Codex
contributions to docs/codex-log.md; and add a line to section 6 requiring any sponsor-track
task to name the demo moment it attaches to.

Edit docs/04-hackathon-plan.md: change moment 7 from a slide to the live operator view, noting
it is a Devpost rule compliance fix; add voice and the authenticity gate to moments 3 and 8;
add the signal layer's visible effect to moment 6 inside its existing 15 seconds; add the new
accounts and SDK work to Stage 0; add tracing spans, the authenticity gate and flagged voice
capture to Stage 1; add "sponsor prizes selected before 2:00 PM Saturday" and "badge IDs
collected" to Gate 2's criteria; add the noisy voice rehearsal and a signal-layer-off script
run to Stage 3; replace Stage 4 item 7 with the signal layer and the openJiuwen evaluation;
extend section 6 with the do-not-build list from docs/06; add risk rows for OMNI credits
exhausted, a GPTZero false positive on a real resident, Elasticsearch unreachable, an
unqualified prize selection, and the operator panel being the only live surface in moment 7;
and extend section 11 with badge IDs, the design-assets link, docs/codex-log.md and three
sentry-findings entries.

Edit docs/05-team-workflow.md: new accounts and keys in section 1; packages/signal owned by
Civic and a named owner for observability code in section 2; the new fixtures in section 3; the
new env var names including the signal layer flag in section 8; a short new subsection adding
one CI job on pull requests running typecheck plus fixture validation; and one sentence in
section 11 about what Civic drops first if Pipeline falls behind.

Append one block per role to docs/roles/*.md naming only that role's new duties, and state
explicitly in docs/roles/3d.md that 3D gains nothing new.

Add one short privacy-boundary subsection to docs/02-architecture.md naming the fields a public
read may never return (raw lon, lat, user_id, audio URLs), what feeds and panels return
instead, and that the civic page is role-gated. Change nothing else in that file.

Update the docs/README.md table with the four new documents and who should read each.

Constraints: the frozen script changes in exactly one place (moment 7), breadth caps are
untouched, and every added task names its stage and owner. Assumptions section in your final
summary message, not inside the patched files.
```
