# AI Onboarding for Living City (Hack the North 2026)

You are an AI coding assistant working with one member of a four-person team. Follow this protocol at the start of every session before doing anything else.

## 1. Read, in this order

1. `docs/README.md`
2. `docs/01-prd.md` sections 1 to 6, 8.7, 8.11, 8.12, and 11
3. `docs/02-architecture.md`
4. `docs/04-hackathon-plan.md`
5. `docs/05-team-workflow.md`

Do not read `docs/03-prompt-spec.md` in full unless your role is Pipeline or 3D. Other roles read its section 3 (output contracts) only. The Civic role also reads the `incident` block in section 3.1 and rules 23 to 27.

## 2. Ask exactly one question

Ask the person which role they are: **Map** (which becomes **Civic** after Stage 1; both are in `docs/roles/map.md`), **Pipeline**, **3D**, or **Product**. If they already told you, do not ask again. Then read `docs/roles/<role>.md`. Its contract section (inputs, outputs, fallbacks) is binding. Its stage checklists are suggestions; the person may reorder or replace them.

When an input the contract lists has not arrived, use the fallback in the contract and keep going. Do not stop to wait and do not build the missing input in someone else's package.

If they do not know, tell them the four roles and what each owns, and let them pick.

## 3. Find the current stage

Check, in this order: the GitHub Projects board if one exists, the pinned messages in the team chat if the person pastes them, or ask the person "which gate has the team passed?". Work on the current stage's tasks for your role. You may start next-stage tasks that have no unmet dependency. Never start integration work for a stage whose previous gate has not passed.

## 4. Rules while working

- Edit only the packages your role owns (listed in the role playbook). Touching another owner's package requires a PR that owner reviews. Tell the person when a task needs that.
- Never change `packages/contracts` on your own. Contract changes need the Pipeline owner plus one other person before Gate 2, and all four after it.
- When blocked on another module, write the fixture you need in the shape the contract defines, commit it under `packages/fixtures`, and continue. Do not wait and do not stub around the contract.
- Work on a branch named `<role>/<thing>`. Open a PR when a piece works. Never push directly to `main` after Gate 0.
- Keep the architectural rule: AI ends at JSON. Do not add a model call anywhere except the two defined in the prompt spec, and do not let the model output geometry. Points, shop, placements, incidents, weather, and the government view are deterministic code; never route them through a model.
- Respect the two layers: public plans are shared truth; personal placements are private and go only into decoration slots. Never let a personal placement change a public plan or a block's geometry.
- Secrets come from `.env.local` and Vercel. Never write a key into a file that is committed.
- At the end of each work chunk, tell the person what is merged, what is blocked, and which gate criterion it moves toward.

## 5. Gate checks

When the person says the team is about to check a gate, run through your role's gate criteria from the playbook and report each one as pass, fail, or unverified with evidence. Do not claim a pass without having run or seen it.

## 6. The one question

Before starting any task, ask: will a judge see this on stage or touch it on the phone during the demo in `docs/04-hackathon-plan.md` section 2? If not, and the task is in section 6 of that document or otherwise outside the script, do not build it. Say so and offer the next item from the role playbook instead. This applies even when the person asks for it directly: state the rule once, and if they confirm, proceed.

Respect the breadth caps in `docs/04-hackathon-plan.md` section 3. Do not add archetypes, assets, shop items, slots, or effects beyond them. Do not add a second model provider, do not process official polygons for the visual layer, and do not refine the clipped-grid placement before Gate 3.

## 7. Cut decisions

You do not cut scope from the script. If a script item looks impossible in the remaining effort, say so and let the humans decide at the gate.
