# Integration pack: sponsor tracks into the Living City plan

Drop this folder into the repo root as `integration/`. It does not replace the Living City pack. It adds four documents to it, patches five files, and audits the result.

## Read first
| File | What it is |
|---|---|
| `00-REVIEW.md` | My assessment of the pack: what stays, one blind spot, four factual corrections from Devpost, three tensions with recommendations |
| `EVENT-FACTS.md` | Verified event mechanics, the committed tracks with their exact requirement clauses, the seven decisions already taken, and the output rules every task must follow |

## Six tasks
| ID | Writes or patches | Wave | Time | Owner |
|---|---|---|---|---|
| T1 | `docs/06-sponsor-tracks.md` | 1, alone | 60 min | Architecture |
| T2 | `docs/07-signal-layer.md` | 2 | 90 min | Civic |
| T3 | `docs/08-voice-and-authenticity.md` | 2 | 75 min | Pipeline plus Product |
| T4 | `docs/09-observability.md` | 2 | 60 min | Product |
| T5 | patches `04`, `05`, `AGENTS.md`, `README.md`, `roles/*`, one paragraph in `02` | 3, alone | 75 min | Architecture |
| T6 | `docs/10-prize-evidence-map.md` plus `integration/AUDIT.md` | 4, alone | 45 min | Architecture |

```
T1  ->  [T2  T3  T4]  ->  T5  ->  T6
        three sessions at once
```
About 4.5 hours of wall clock. T1, T5 and T6 run alone because they touch decisions or files the others depend on. T5 is deliberately one task rather than five: the patches must be consistent with each other, and five agents editing `docs/04` at once would be a merge fight.

## How to run one task
1. Fresh agent session, opened at the repo root so it can read `docs/` and `AGENTS.md`.
2. Paste the task's "Prompt to paste" block verbatim. It names everything to read.
3. Read only the `## Assumptions` section and the headline decision when it finishes. Do not deep-review yet.
4. One branch per task, one file per branch where possible: `integration/t2-signal-layer`.

## Merge protocol (you, not an agent)
1. Merge T1 first and read it yourself. Everything downstream inherits its decisions, especially the amended two-call rule and the provider swap.
2. Merge T2, T3 and T4 together, reading their Assumptions blocks side by side. Conflicting assumptions are the reason this step exists.
3. Run T5 only after those three are merged, otherwise it patches the plan against documents that then change.
4. Run T6 last and treat `AUDIT.md` as the acceptance test. A blocking finding means the pack is not ready to freeze.

## The rules that outrank every task
1. The demo script and breadth caps do not change. Moment 7 is the single exception, and only because Devpost forbids a slide deck in the pitch.
2. No model call between a post and a block rebuild except Call A and Call B. A third call lives in the civic layer only, behind a flag, after Gate 2.
3. Nothing new lands on the Pipeline owner except the provider swap, the authenticity gate and trace spans. Pipeline and 3D are the critical path.
4. Every sponsor feature has a flip-off path. A feature that cannot be switched off without breaking the demo is not allowed in.
5. A prize whose work did not land is not selected at 2:00 PM Saturday.
6. If a track appears to need a new demo moment, write the conflict down and let the four of you decide.
