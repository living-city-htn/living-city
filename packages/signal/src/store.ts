/**
 * The signal layer's own records: the `agent_actions` audit table, the
 * suggestions the agent may write when it is below the confidence floor, and
 * the annotations it hangs off an incident (merges, corroboration, dissent,
 * escalation).
 *
 * Module memory, for the same reason `packages/civic/src/in-memory.ts` is:
 * there is no Postgres in this repo yet. The public surface is shaped like the
 * table it will become, so the migration is a body swap. Every field that would
 * be a column is a field here, including the ones only an audit trail needs.
 *
 * Two invariants this module enforces and the agent cannot talk its way past:
 *
 *   1. **Every write is recorded.** An action is only applied through
 *      `record()`, which stores the undo payload alongside it. There is no path
 *      that changes an incident without leaving a row.
 *   2. **Staff decisions win.** `staffTouched()` is checked before any write,
 *      and a staff override marks the incident permanently off-limits to the
 *      agent for that field. Reverting an agent action never un-does a staff
 *      decision, because a staff decision is never an agent action.
 */
import type { Incident } from '@living-city/contracts'

export type AgentActionKind =
  | 'file_incident'
  | 'merge_duplicate_reports'
  | 'raise_severity'
  | 'attach_corroborating_posts'
  | 'flag_low_confidence'
  | 'escalate_cluster'

export type AgentAction = {
  id: string
  run_id: string
  kind: AgentActionKind
  /** The incident the action touched, when there is one. */
  target_incident_id: string | null
  /** The posts the agent cited as its reason. Never empty for a write. */
  evidence_post_ids: string[]
  /** Why, in the agent's own words. Shown to staff verbatim. */
  reason: string
  /** What `revert` restores. Opaque to everything except the reverting code. */
  undo: Record<string, unknown>
  created_at: string
  reverted_at: string | null
  reverted_by: string | null
}

/** Below the confidence floor the agent writes one of these instead of acting. */
export type AgentSuggestion = {
  id: string
  run_id: string
  kind: AgentActionKind
  target_incident_id: string | null
  evidence_post_ids: string[]
  reason: string
  confidence: number
  created_at: string
  /** Staff accepting a suggestion is a staff decision, not an agent action. */
  resolved_at: string | null
  resolution: 'accepted' | 'dismissed' | null
}

/** What the agent has attached to an incident beyond the contract's own fields.
 *  Kept here rather than on `Incident`, because `Incident` is Pipeline's shape
 *  and this layer may not change it. The additions are a REQUEST in SIGNAL.md. */
export type IncidentAnnotation = {
  incident_id: string
  /** Post ids corroborating the incident, beyond its originating post. */
  corroborating_post_ids: string[]
  /** Incident ids merged into this one. */
  merged_incident_ids: string[]
  /** Set on an incident that was merged away, pointing at its survivor. */
  merged_into: string | null
  /** Recorded, never hidden: the contradicting evidence and what it said. */
  dissent: Array<{ post_id: string; note: string; weight: number }>
  /** 0-100, from `scoring.ts`. */
  confidence: number | null
  escalated_at: string | null
  low_confidence: boolean
  updated_at: string
}

export type AgentRunLog = {
  run_id: string
  started_at: string
  finished_at: string | null
  /** Model calls this run made. */
  calls: number
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  duration_ms: number
  actions: number
  suggestions: number
  outcome: 'ok' | 'error' | 'capped' | 'disabled'
  error: string | null
}

type State = {
  actions: AgentAction[]
  suggestions: AgentSuggestion[]
  annotations: Map<string, IncidentAnnotation>
  runs: AgentRunLog[]
  /** `${incident_id}:${field}` for every field a human has decided. */
  staffLocks: Set<string>
  seq: number
}

let state: State = blank()

function blank(): State {
  return {
    actions: [],
    suggestions: [],
    annotations: new Map(),
    runs: [],
    staffLocks: new Set(),
    seq: 0,
  }
}

/** The operator's reset button and the tests. */
export const resetSignalStore = (): void => { state = blank() }

const nextId = (prefix: string) => {
  state.seq += 1
  return `${prefix}-${String(state.seq).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Staff wins
// ---------------------------------------------------------------------------

/**
 * An incident a human has already decided about.
 *
 * Two sources. The contract's own evidence - a verified status or a staff note
 * - means staff have looked at this row, and the agent stops touching it.
 * `lockField` adds the finer-grained version for a staff member who changed one
 * field and left the rest open.
 */
export const staffTouched = (incident: Incident, field?: string): boolean => {
  if (incident.status === 'verified') return true
  if (incident.staff_note !== null && incident.staff_note !== '') return true
  if (field && state.staffLocks.has(`${incident.id}:${field}`)) return true
  return state.staffLocks.has(`${incident.id}:*`)
}

/** Called by the civic routes when staff change something by hand. */
export const lockField = (incidentId: string, field = '*'): void => {
  state.staffLocks.add(`${incidentId}:${field}`)
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const record = (input: Omit<AgentAction, 'id' | 'created_at' | 'reverted_at' | 'reverted_by'>): AgentAction => {
  const action: AgentAction = {
    ...input,
    id: nextId('act'),
    created_at: new Date().toISOString(),
    reverted_at: null,
    reverted_by: null,
  }
  state.actions.push(action)
  return { ...action }
}

export const listActions = (filter: { runId?: string; incidentId?: string; includeReverted?: boolean } = {}): AgentAction[] =>
  state.actions
    .filter((a) =>
      (!filter.runId || a.run_id === filter.runId)
      && (!filter.incidentId || a.target_incident_id === filter.incidentId)
      && (filter.includeReverted || a.reverted_at === null))
    .map((a) => ({ ...a }))

export const getAction = (id: string): AgentAction | null => {
  const action = state.actions.find((a) => a.id === id)
  return action ? { ...action } : null
}

/** Marks an action reverted. Applying the undo is the caller's job, because it
 *  needs the write port and this module deliberately has no ports. */
export const markReverted = (id: string, by: string): AgentAction | null => {
  const action = state.actions.find((a) => a.id === id)
  if (!action || action.reverted_at !== null) return null
  action.reverted_at = new Date().toISOString()
  action.reverted_by = by
  return { ...action }
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const suggest = (
  input: Omit<AgentSuggestion, 'id' | 'created_at' | 'resolved_at' | 'resolution'>,
): AgentSuggestion => {
  const suggestion: AgentSuggestion = {
    ...input,
    id: nextId('sug'),
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolution: null,
  }
  state.suggestions.push(suggestion)
  return { ...suggestion }
}

export const listSuggestions = (filter: { open?: boolean } = {}): AgentSuggestion[] =>
  state.suggestions
    .filter((s) => (filter.open === undefined ? true : (s.resolved_at === null) === filter.open))
    .map((s) => ({ ...s }))

export const resolveSuggestion = (
  id: string, resolution: 'accepted' | 'dismissed',
): AgentSuggestion | null => {
  const suggestion = state.suggestions.find((s) => s.id === id)
  if (!suggestion || suggestion.resolved_at !== null) return null
  suggestion.resolved_at = new Date().toISOString()
  suggestion.resolution = resolution
  return { ...suggestion }
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

const blankAnnotation = (incidentId: string): IncidentAnnotation => ({
  incident_id: incidentId,
  corroborating_post_ids: [],
  merged_incident_ids: [],
  merged_into: null,
  dissent: [],
  confidence: null,
  escalated_at: null,
  low_confidence: false,
  updated_at: new Date().toISOString(),
})

export const annotationOf = (incidentId: string): IncidentAnnotation => {
  const existing = state.annotations.get(incidentId)
  return existing ? { ...existing } : blankAnnotation(incidentId)
}

export const annotate = (
  incidentId: string,
  patch: Partial<Omit<IncidentAnnotation, 'incident_id'>>,
): IncidentAnnotation => {
  const current = state.annotations.get(incidentId) ?? blankAnnotation(incidentId)
  const next: IncidentAnnotation = {
    ...current,
    ...patch,
    incident_id: incidentId,
    updated_at: new Date().toISOString(),
  }
  state.annotations.set(incidentId, next)
  return { ...next }
}

export const listAnnotations = (): IncidentAnnotation[] =>
  [...state.annotations.values()].map((a) => ({ ...a }))

// ---------------------------------------------------------------------------
// Run log
// ---------------------------------------------------------------------------

export const startRun = (): AgentRunLog => {
  const run: AgentRunLog = {
    run_id: nextId('run'),
    started_at: new Date().toISOString(),
    finished_at: null,
    calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    actions: 0,
    suggestions: 0,
    outcome: 'ok',
    error: null,
  }
  state.runs.push(run)
  return run
}

export const finishRun = (runId: string, patch: Partial<AgentRunLog>): AgentRunLog | null => {
  const run = state.runs.find((r) => r.run_id === runId)
  if (!run) return null
  Object.assign(run, patch, { finished_at: new Date().toISOString() })
  return { ...run }
}

export const listRuns = (limit = 20): AgentRunLog[] =>
  state.runs.slice(-limit).reverse().map((r) => ({ ...r }))

/** Total spend since the process started. The ceiling is checked against this. */
export const spentUsd = (): number =>
  state.runs.reduce((total, run) => total + run.cost_usd, 0)

/** Runs started inside the last minute, for the calls-per-minute cap. */
export const runsSince = (sinceMs: number): number =>
  state.runs.filter((run) => Date.parse(run.started_at) >= sinceMs).length
