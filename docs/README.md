# Living City: Planning Documents

Pre-hackathon planning for Hack the North 2026. Demo city: Kitchener-Waterloo. These are design documents only. No code or assets exist yet by design.

| Doc | Purpose | Read it if you are |
|---|---|---|
| [01-prd.md](01-prd.md) | Product requirements: goals, users, stories, scope tiers, game loop, civic view, extensions, metrics, risks | Anyone, first |
| [02-architecture.md](02-architecture.md) | Four-module city pipeline plus the game and civic layers, data flow, interface ownership, tech stack, data model, API | Every engineer, before kickoff |
| [03-prompt-spec.md](03-prompt-spec.md) | Strict contracts and behavior rules for the two AI calls, enums, examples, failure handling | Pipeline owner, 3D owner; Civic reads the incident block |
| [04-hackathon-plan.md](04-hackathon-plan.md) | The demo path: the frozen script as the build list, breadth caps, stages and gates, what is not built, how moment 4 lands | Everyone, at kickoff, and again whenever tempted to build something |
| [05-team-workflow.md](05-team-workflow.md) | Repo layout, module ownership, mock fixtures, branch rules, gates, secrets, deploy | Everyone, before first commit |
| [roles/](roles/) | One self-contained playbook per role: Map then Civic, Pipeline, 3D, Product, with stage checklists and owned gate criteria | Your own role, then your AI |

## The one rule

AI interprets reality and plans visual intent. AI ends at structured JSON. Everything geometric, procedural, rendered, scored, sold, placed, or reported is deterministic code.

## The weekend rule

Build the demo, not the product. The PRD describes the product in tiers. The hackathon plan turns the demo script into the build list and names what is deliberately not built. One question decides everything: will a judge see this on stage or touch it on the phone?

## Working with an AI assistant

The repo root has `AGENTS.md` (and `CLAUDE.md`, which imports it). Any AI coding assistant opened in the repo reads it, reads these docs, asks which role you are (Map then Civic, Pipeline, 3D, or Product), and then works from `docs/roles/<role>.md` for the current stage. Tell it your role and which gate the team has passed and it can start.

## Reading order at kickoff

1. PRD sections 1 to 6 (ten minutes).
2. Architecture sections 2 to 5 (fifteen minutes).
3. Each owner reads the prompt spec sections relevant to their module.
4. Hackathon plan and team workflow, then freeze the contracts.
