import { guardStatus, listActions, listRuns, listSuggestions, revertAction, runAgent } from '@living-city/signal'
import { badRequest, json, readJson } from '@/lib/stub'
import { requireGovernment } from '@/lib/civic-gate'
import { signalEnabled } from '@/lib/signal'

// GET  /api/civic/signal/agent            -> recent runs, open actions, guard status
// POST /api/civic/signal/agent            -> { block?, window? }  run it once
// POST /api/civic/signal/agent  { revert } -> undo one action, as staff
//
// The trigger is here and nowhere else. No model call may sit between a post
// being created and the block rebuilding, so nothing in the post path reaches
// the agent: it runs on demand from this route, or from a ticker calling this
// route. That is the whole reason it is a route rather than a hook.

export async function GET(req: Request) {
  const denied = requireGovernment(req)
  if (denied) return denied
  if (!signalEnabled()) {
    return json({ error: 'signal layer is off', code: 'SIGNAL_LAYER_OFF' }, 404)
  }
  return json({
    runs: listRuns(10),
    actions: listActions(),
    suggestions: listSuggestions({ open: true }),
    guards: guardStatus(),
  })
}

export async function POST(req: Request) {
  const denied = requireGovernment(req)
  if (denied) return denied
  if (!signalEnabled()) {
    return json({ error: 'signal layer is off', code: 'SIGNAL_LAYER_OFF' }, 404)
  }

  const body = await readJson<{ block?: string; window?: string; revert?: string }>(req)

  // Staff undoing an agent action. Kept on this route rather than a new one so
  // the demo flow gains no extra endpoint.
  if (body?.revert) {
    const result = revertAction(body.revert, 'staff')
    if (!result.ok) return badRequest(result.error)
    return json({ reverted: result.value })
  }

  const result = await runAgent({ blockId: body?.block, window: body?.window })
  // A refused run (rate cap, spend ceiling) is a 200 with an honest outcome
  // rather than an error: the page renders the reason, and a judge tapping the
  // button twice should see "capped", not a red box.
  return json({
    run: result.run,
    actions: listActions({ runId: result.run.run_id }),
    narrative: result.narrative,
    error: result.error,
    guards: guardStatus(),
  })
}
