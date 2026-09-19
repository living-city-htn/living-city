# Event facts and committed tracks (frozen input for every integration task)

Source: the Hack the North 2026 Devpost page, read on 2026-09-17. Everything here is verified from that page unless marked.

## Mechanics
- Sept 18 to 20, 2026. 36 hours. Open-ended, no theme. 31 non-cash prizes plus sponsor cash.
- Judging criteria: **WOW factor, technical ability, originality, design**.
- **"Your judging pitch should be a live demo, not a slide deck or a product pitch."**
- Submission requires: a project built during the hackathon, a link to source code **including all design assets created at the event**, the **badge ID of every team member exactly as printed under the QR code on their badge**, and **every sponsor prize you want to be considered for, selected before 2:00 PM EDT Saturday**. A demo video is optional but recommended.
- Main award: 12 Finalists, no first, second or third. They reward "creative and surprising" work, and explicitly say a project does not need a business plan or a world problem.

## Committed tracks and the exact clause that constrains us
| Track | Clause that must be satisfied |
|---|---|
| **Rox: Best AI Agent** ($10K / $2K, 2 winners) | "build agents that can handle unstructured information, incomplete datasets, conflicting sources, or noisy data", "take meaningful actions", demonstrating "data cleaning and validation, multi-source resolution, intelligent error handling, or robust decision-making under uncertainty". Judged on technical complexity, creativity, handling of real-world messiness, practical utility. |
| **Elastic: Find the Signal** (2 winners) | Messy unstructured real-world data turned into "something a person or agent can actually act on", with "agentic systems: agents that can reason over your data, decide what to retrieve, call tools, and trigger actions on their own, with Elasticsearch as their context layer". Explicitly "beyond RAG with a chatbot": hybrid search (BM25 plus dense vectors plus reranking), aggregations, ES\|QL, geo or time-series queries, and workflows that take action. |
| **Sentry: Best Use of Sentry** (1 winner) | "use at least two products beyond error monitoring: Session Replay, Logs, Tracing, Profiling, Uptime Monitoring, or our MCP/AI agent monitoring", and show "how observability actually shaped what you built". Judged on creativity, depth of integration, and whether Sentry data meaningfully influenced the project. |
| **OpenAI: API Prizes** (3 winners) | "Use the OpenAI API to build something ambitious, with Codex as your development teammate." Judged on what the API powers and "how Codex helped you build it". In the demo: show the product, explain the API's role, and share **one concrete way Codex improved the process or outcome**. |
| **GPTZero** (2 winners) | Use their AI-detection or hallucination-detection APIs "in significant ways", protecting "the quality and authenticity" of information. |
| **Huawei: OMNI Live** (2 winners) | A real-time multimodal app for an edge-device scenario using an OMNI multimodal model via cloud API. Must "meaningfully incorporate all three core modalities (vision/video, speech/audio, and language)" and demonstrate at least one complete end-to-end scenario. Mockups do not count. |
| **Huawei: openJiuwen Multi-Agent** (2 winners, conditional) | "genuine agent collaboration: task decomposition, communication, tool use, and coordination, rather than simply chaining LLM prompts together". JiuwenSwarm or WorkSwarm encouraged, not required. Up to $40 USD API credits per team. **Select this prize only if the civic subsystem is genuinely multi-agent.** |

## Decisions already taken (do not re-open inside a task)
1. The Living City pack (`docs/01` to `docs/05`, `AGENTS.md`, roles) remains the main plan. The demo script, breadth caps, stages, gates, ownership and fixture strategy are unchanged.
2. **Amended architectural rule:** no model call may sit between a post and a block rebuild except Call A and Call B. A third call is permitted **only** in the civic layer, off the demo critical path, behind a feature flag, and only after Gate 2.
3. **OpenAI becomes the single critical-path provider** for Call A and Call B. Gemini stays documented as an unbuilt alternate.
4. **OMNI is an additive perception step for voice posts only.** Photo and text posts never call it. Voice failure degrades to text.
5. **The signal layer (Elasticsearch plus the agentic civic subsystem) belongs to the Civic owner**, never to Pipeline. The deterministic aggregator stays authoritative for planning.
6. The architecture slide is replaced by a live surface, because of the live-demo rule.
7. No track may change the demo script. If a track needs a demo moment, it attaches to a moment that already exists.

## Output rules for every integration task
1. Write or patch only the files your task names. Nothing else.
2. Match the pack's existing voice: short declarative sentences, tables over prose, numbers over adjectives, no marketing language, no em dashes.
3. Open every new document with `Status`, `Last updated`, and a one-line statement of what it decides.
4. Every addition must answer the pack's own question: will a judge see this on stage or touch it on the phone? If the answer is no, say which gate it is allowed to start after, and what happens if it is never built.
5. Anything you had to assume goes in an `## Assumptions` section at the top, so conflicts surface at merge.
6. Never contradict `docs/04-hackathon-plan.md` section 2 (the frozen script) or section 3 (breadth caps). If your work seems to require it, write the conflict down instead of resolving it.
