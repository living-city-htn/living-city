/**
 * The civic agent: one run, on demand.
 *
 * **Is this one call or several coordinating agents? It is one agent, in a
 * tool-calling loop, making several model calls.** One model, one system
 * prompt, one conversation; it decides which tool to call next and stops when
 * it has nothing left to do. There is no planner/worker split, no second agent
 * reviewing the first, and no message passing between roles. Anywhere the
 * documentation needs to claim multi-agent coordination, this does not qualify
 * and should not be entered as such.
 *
 * Where it may run, and where it may not: on demand from the civic page, or on
 * a ticker. **Never inline in the post handler.** No model call may sit between
 * a post being created and the block rebuilding, which is why nothing in
 * `ingest.ts` imports this file.
 *
 * What it can do to the city: nothing. It reads the evidence index and writes
 * incidents, annotations and audit rows. The deterministic aggregator is
 * untouched, Call B never sees any of this, and the renderer reads none of it.
 */
import { env } from '../env'
import { log } from '../log'
import { authenticityOf } from '../doc'
import { civicRead } from '../ports'
import { windowStart } from '../retrieval'
import { dissentNote, resolveConflict, type Claim, type Verdict } from '../scoring'
import { finishRun, startRun, type AgentRunLog } from '../store'
import { MAX_MALFORMED, MAX_TURNS, checkGuards } from './guards'
import { TOOLS, toolByName, toolSchema, type ToolContext } from './tools'

/**
 * Per-million-token prices for the run log. Defaults are for gpt-4.1-mini and
 * are the figure to check against the provider's pricing page before the demo;
 * they exist so the spend ceiling has something to count, not as a guarantee.
 */
const PRICE_IN = Number(process.env.SIGNAL_PRICE_IN_PER_M ?? 0.4)
const PRICE_OUT = Number(process.env.SIGNAL_PRICE_OUT_PER_M ?? 1.6)

const SYSTEM = `You are the civic triage agent for a city's resident reporting system.

You read evidence that residents posted and you maintain the incident list that city staff act on. You are not a chatbot and nobody reads your prose; your output is the tool calls you make.

How to work:
1. Retrieve before you act. Call search_evidence and lookup_incidents first. Never write about a block you have not looked at.
2. Cite evidence. Every write takes evidence_post_ids and a reason. The reason is read by a staff member, so write a sentence explaining what the evidence shows, not a label.
3. Prefer the smallest action. Attaching a corroborating post is better than filing a second incident. Merging duplicates is better than leaving three rows for one fallen tree.
4. Contradictions are not noise. If two residents disagree about the same block in the same window, do not pick one and delete the other. Record the dissent and flag low confidence.
5. Staff always win. An incident marked staff_decided is not yours. Do not attempt it; the tool will refuse and you will have wasted a turn.
6. Uncertainty is an answer. If the evidence is thin, flag_low_confidence or do nothing. Doing nothing is a correct outcome and needs no justification.

Stop when you have handled what the evidence supports. Do not invent work.`

export type AgentRunResult = {
  run: AgentRunLog
  actions: string[]
  narrative: string
  error: string | null
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
    finish_reason?: string
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const callModel = async (messages: ChatMessage[]): Promise<ChatResponse> => {
  const response = await fetch(`${env.openaiBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.openaiApiKey()}`,
    },
    body: JSON.stringify({
      model: env.agentModel(),
      messages,
      tools: toolSchema(),
      // Determinism, for the same reason docs/03 principle 7 wants it on the
      // two pipeline calls: a demo that behaves differently on the second run
      // cannot be rehearsed.
      temperature: 0,
    }),
    signal: AbortSignal.timeout(env.agentTimeoutMs()),
  })
  if (!response.ok) {
    throw new Error(`model call failed: ${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  return (await response.json()) as ChatResponse
}

/**
 * The conflict maths runs here, in deterministic code, before the model is
 * asked anything. The agent is told what the evidence weighs and where it
 * disagrees; it does not get to decide who is right by vibes.
 *
 * One verdict per block in the window, built from the same PostAnalysis records
 * everything else reads.
 */
export const verdictsFor = (
  options: { blockId?: string; window?: string } = {},
): Array<{ block_id: string; verdict: Verdict; dissent_note: string }> => {
  const port = civicRead()
  if (!port) return []

  const since = windowStart(options.window ?? '1h') ?? undefined
  const records = port.listEvidence({ blockId: options.blockId, since, limit: 500 })

  const byBlock = new Map<string, Claim[]>()
  for (const record of records) {
    const claims = byBlock.get(record.post.community_id) ?? []
    claims.push({
      post_id: record.post.id,
      user_id: record.post.user_id,
      created_at: record.post.created_at,
      assertion: record.analysis.incident.type,
      authenticity: authenticityOf(record.analysis),
      confidence: record.analysis.confidence,
    })
    byBlock.set(record.post.community_id, claims)
  }

  return [...byBlock.entries()]
    // A block where everyone agrees on "nothing is wrong" is not worth a turn.
    .filter(([, claims]) => claims.some((c) => c.assertion !== 'none'))
    .map(([block_id, claims]) => {
      const verdict = resolveConflict(claims, { floor: env.confidenceFloor() })
      return { block_id, verdict, dissent_note: dissentNote(verdict) }
    })
}

export type RunAgentOptions = {
  /** Restrict the run to one block. The civic page always passes this. */
  blockId?: string
  /** What to look at. Defaults to the last hour. */
  window?: string
}

/**
 * Run the agent once.
 *
 * Never throws. A failure is a run log with `outcome: 'error'` and a reason,
 * because the civic page calling this must always have something to render.
 */
export const runAgent = async (options: RunAgentOptions = {}): Promise<AgentRunResult> => {
  const started = Date.now()
  const run = startRun()
  const ctx: ToolContext = { runId: run.run_id }
  const actions: string[] = []

  const fail = (outcome: AgentRunLog['outcome'], error: string): AgentRunResult => {
    const finished = finishRun(run.run_id, {
      outcome, error, duration_ms: Date.now() - started, actions: actions.length,
    })
    log.warn('agent.stopped', { run_id: run.run_id, outcome, error })
    return { run: finished ?? run, actions, narrative: '', error }
  }

  if (!env.enabled()) return fail('disabled', 'SIGNAL_LAYER is off')
  if (!env.openaiApiKey()) return fail('disabled', 'OPENAI_API_KEY is not set, so the agent cannot run')
  if (!civicRead()) return fail('disabled', 'no civic read port is wired up')

  // Rate and spend, checked once before any money is spent and never mid-run.
  const guard = checkGuards()
  if (!guard.allowed) return fail(guard.outcome, guard.reason)

  const window = options.window ?? '1h'
  const verdicts = verdictsFor({ blockId: options.blockId, window })

  // The deterministic verdicts go in the first message rather than behind a
  // tool, so the model cannot skip them and start guessing. `action` is the
  // floor: `suggest` means it may not write, whatever it concludes.
  // Empty retrieval is not an error and must not cost a model call. A block
  // with nothing reported in the window is a finished run with no actions.
  if (verdicts.length === 0) {
    const finished = finishRun(run.run_id, {
      calls: 0, duration_ms: Date.now() - started, actions: 0, outcome: 'ok',
    })
    log.info('agent.nothing_to_do', { run_id: run.run_id, window, block: options.blockId ?? 'all' })
    return {
      run: finished ?? run,
      actions: [],
      narrative: 'No block had a reported or contested incident in this window, so nothing was done.',
      error: null,
    }
  }

  const brief = verdicts.length === 0
    ? 'No block has a contested or reported incident in this window.'
    : verdicts.map(({ block_id, verdict, dissent_note }) =>
        `${block_id}: verdict "${verdict.assertion}" at confidence ${verdict.confidence} `
        + `(${verdict.authors} author(s), agreement ${Math.round(verdict.agreement * 100)}%, `
        + `permitted action: ${verdict.action}). ${dissent_note} `
        + `Supporting posts: ${verdict.support.join(', ') || 'none'}.`).join('
')

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        options.blockId
          ? `Triage block ${options.blockId} over the last ${window}.`
          : `Triage the city over the last ${window}.`,
        '',
        'Conflict resolution has already been computed deterministically. Do not re-derive it:',
        brief,
      ].join('
'),
    },
  ]

  let calls = 0
  let promptTokens = 0
  let completionTokens = 0
  let malformed = 0
  let narrative = ''

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await callModel(messages)
      calls++
      promptTokens += response.usage?.prompt_tokens ?? 0
      completionTokens += response.usage?.completion_tokens ?? 0

      const message = response.choices?.[0]?.message
      if (!message) {
        // Malformed output: retry once, then give up cleanly.
        if (++malformed > MAX_MALFORMED) return fail('error', `the model returned no usable message ${malformed} times; giving up`)
        messages.push({ role: 'user', content: 'That response was empty. Call a tool or say you are done.' })
        continue
      }

      const toolCalls = message.tool_calls ?? []
      if (toolCalls.length === 0) {
        narrative = message.content ?? ''
        break
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls })

      for (const call of toolCalls) {
        const tool = toolByName(call.function.name)
        if (!tool) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: `no tool named ${call.function.name}` }),
          })
          continue
        }

        let args: unknown
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          // Malformed arguments are a tool error, not a crash: the model gets
          // one honest message back and can correct itself on the next turn.
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: 'arguments were not valid JSON' }),
          })
          continue
        }

        const result = await tool.run(args, ctx)
        if (result.ok && tool.kind === 'write') {
          const value = result.value as { action_id?: string }
          if (value.action_id) actions.push(value.action_id)
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : String(error))
  }

  const cost = (promptTokens / 1_000_000) * PRICE_IN + (completionTokens / 1_000_000) * PRICE_OUT
  const finished = finishRun(run.run_id, {
    calls,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: Number(cost.toFixed(6)),
    duration_ms: Date.now() - started,
    actions: actions.length,
    outcome: 'ok',
  })

  log.info('agent.done', {
    run_id: run.run_id, calls, actions: actions.length,
    cost_usd: Number(cost.toFixed(6)), duration_ms: Date.now() - started,
  })

  return { run: finished ?? run, actions, narrative, error: null }
}

/** The tool surface, for documentation and for the civic page's "what can it
 *  do" list. Read tools first, then writes. */
export const toolSurface = () =>
  TOOLS.map((tool) => ({ name: tool.name, kind: tool.kind, description: tool.description }))
