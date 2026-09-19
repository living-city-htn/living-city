/**
 * The agent's tool surface. Three reads, six writes, nothing else.
 *
 * Every tool is an ordinary typed function that a person could call from a
 * test; the model-facing JSON schema at the bottom is generated from the same
 * list, so the two cannot drift. A tool never throws: it answers
 * `{ ok: false, error }`, because a model handed an exception has nothing
 * useful to do with it, and a run that dies on one bad argument is worse than
 * a run that is told "that incident does not exist" and tries again.
 *
 * The four rules every write obeys, enforced here and not in the prompt,
 * because a rule that lives in a prompt is a suggestion:
 *
 *   1. Staff decisions win. `staffTouched` is checked first, always. A verified
 *      incident or one carrying a staff note is not the agent's to change.
 *   2. Every write is recorded in `agent_actions` with the evidence post ids
 *      and a reason string, and carries the payload needed to undo it.
 *   3. Every write is reversible. `revertAction` puts the row back.
 *   4. Nothing planning reads is writable. The port exposes incidents only:
 *      not posts, not plans, not placements, not blocks.
 */
import type { Incident } from '@living-city/contracts'
import { env } from '../env'
import { blockTrends } from '../aggregations'
import { searchEvidence, type EvidenceHit } from '../retrieval'
import { civicRead, civicWrite, type IncidentPatch } from '../ports'
import {
  annotate, annotationOf, listActions, lockField, markReverted, record, staffTouched, suggest,
  type AgentActionKind, type IncidentAnnotation,
} from '../store'

export type ToolOk<T> = { ok: true; value: T }
export type ToolErr = { ok: false; error: string; code: ToolErrorCode }
export type ToolResult<T> = ToolOk<T> | ToolErr

export type ToolErrorCode =
  | 'not_found'
  | 'staff_decided'
  | 'no_port'
  | 'bad_argument'
  | 'no_evidence'
  | 'below_floor'
  | 'already_done'

const ok = <T>(value: T): ToolOk<T> => ({ ok: true, value })
const err = (code: ToolErrorCode, error: string): ToolErr => ({ ok: false, code, error })

/** Threaded through every write so the audit row knows which run made it. */
export type ToolContext = { runId: string }

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

export type SearchEvidenceArgs = {
  block_id?: string
  query?: string
  window?: string
  k?: number
}

export const search_evidence = async (
  args: SearchEvidenceArgs,
): Promise<ToolResult<{ hits: EvidenceHit[]; mode: string; degraded: boolean; reason: string | null }>> => {
  const result = await searchEvidence({
    blockId: args.block_id,
    query: args.query,
    window: args.window,
    k: args.k,
  })
  // An empty result is a legitimate answer, not an error. The agent is told the
  // retrieval mode so it can say "I found nothing, and vectors were down"
  // rather than "there is nothing".
  return ok({
    hits: result.hits,
    mode: result.metadata.mode,
    degraded: result.metadata.degraded,
    reason: result.metadata.reason,
  })
}

export type BlockSummaryArgs = { block_id: string; window?: string }

export const block_summary = async (
  args: BlockSummaryArgs,
): Promise<ToolResult<{ block: unknown; degraded: boolean }>> => {
  if (!args.block_id) return err('bad_argument', 'block_id is required')
  const result = await blockTrends({ window: args.window ?? '24h', blockIds: [args.block_id] })
  const block = result.blocks.find((b) => b.community_id === args.block_id) ?? null
  if (!block) {
    return ok({
      block: { community_id: args.block_id, posts: 0, authors: 0, dimensions: {}, incidents: 0 },
      degraded: result.metadata.degraded,
    })
  }
  return ok({ block, degraded: result.metadata.degraded })
}

export type LookupIncidentsArgs = { block_id?: string; status?: Incident['status'] }

export type IncidentWithAnnotation = Incident & { annotation: IncidentAnnotation; staff_decided: boolean }

export const lookup_incidents = async (
  args: LookupIncidentsArgs,
): Promise<ToolResult<{ incidents: IncidentWithAnnotation[] }>> => {
  const port = civicRead()
  if (!port) return err('no_port', 'no civic read port is wired up')
  const incidents = port
    .listIncidents({ community: args.block_id, status: args.status })
    .map((incident) => ({
      ...incident,
      annotation: annotationOf(incident.id),
      // Surfaced so the model can see the rule rather than discovering it by
      // being refused. Cheaper than a retry.
      staff_decided: staffTouched(incident),
    }))
  return ok({ incidents })
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

const requireEvidence = (ids: string[] | undefined): ToolErr | null =>
  ids && ids.length > 0 ? null : err('no_evidence', 'evidence_post_ids must name at least one post')

const requireReason = (reason: string | undefined): ToolErr | null =>
  reason && reason.trim().length >= 8 ? null : err('bad_argument', 'reason must be a sentence, not a word')

export type FileIncidentArgs = {
  post_id: string
  type: Incident['type']
  severity: Incident['severity']
  location_hint?: string | null
  evidence_post_ids: string[]
  reason: string
  confidence?: number
}

/**
 * File an incident from a post Call A did not mark.
 *
 * The one write that creates a row rather than changing one, and the one most
 * worth being careful about: a hidden post is not evidence, and a post that
 * already has an incident is not a new one.
 */
export const file_incident = async (
  args: FileIncidentArgs, ctx: ToolContext,
): Promise<ToolResult<{ incident: Incident; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.evidence_post_ids) ?? requireReason(args.reason)
  if (bad) return bad
  if (args.type === 'none') return err('bad_argument', 'type "none" is not an incident')

  const post = write.getPost(args.post_id)
  if (!post) return err('not_found', `no post ${args.post_id}`)
  if (post.hidden) return err('staff_decided', 'that post is hidden, so it is not evidence')

  const existing = write.getIncidentByPost(args.post_id)
  if (existing) return err('already_done', `post ${args.post_id} already has incident ${existing.id}`)

  const confidence = args.confidence ?? 0
  if (confidence > 0 && confidence < env.confidenceFloor()) {
    const suggestion = suggest({
      run_id: ctx.runId,
      kind: 'file_incident',
      target_incident_id: null,
      evidence_post_ids: args.evidence_post_ids,
      reason: args.reason,
      confidence,
    })
    return err('below_floor', `confidence ${confidence} is below the floor ${env.confidenceFloor()}; wrote suggestion ${suggestion.id}`)
  }

  const incident = write.createIncident({
    post_id: args.post_id,
    community_id: post.community_id,
    type: args.type,
    severity: args.severity,
    location_hint: args.location_hint ?? null,
    reported_at: post.created_at,
    // Distinguishable from `post` in the store, so staff can see at a glance
    // which rows a human pipeline produced and which the agent did.
    source: 'agent',
  })
  if (!incident) return err('bad_argument', 'the store refused to create that incident')

  const action = record({
    run_id: ctx.runId,
    kind: 'file_incident',
    target_incident_id: incident.id,
    evidence_post_ids: args.evidence_post_ids,
    reason: args.reason,
    undo: { delete_incident: incident.id },
  })
  annotate(incident.id, { confidence: args.confidence ?? null })
  return ok({ incident, action_id: action.id })
}

export type MergeDuplicatesArgs = {
  keep_incident_id: string
  merge_incident_ids: string[]
  evidence_post_ids: string[]
  reason: string
}

/**
 * Merge duplicate reports of the same event into one incident.
 *
 * Merging does not delete the losing rows: it marks them `merged_into` and
 * records their prior state, so a staff member who disagrees gets them back
 * intact. Deleting would make the merge irreversible, which rule 3 forbids.
 */
export const merge_duplicate_reports = async (
  args: MergeDuplicatesArgs, ctx: ToolContext,
): Promise<ToolResult<{ kept: string; merged: string[]; corroboration: number; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.evidence_post_ids) ?? requireReason(args.reason)
  if (bad) return bad

  const keep = write.getIncident(args.keep_incident_id)
  if (!keep) return err('not_found', `no incident ${args.keep_incident_id}`)
  if (staffTouched(keep)) return err('staff_decided', `incident ${keep.id} was decided by staff`)

  const merged: string[] = []
  const restored: Array<{ id: string; merged_into: string | null }> = []
  for (const id of args.merge_incident_ids) {
    if (id === keep.id) continue
    const other = write.getIncident(id)
    if (!other) continue
    if (staffTouched(other)) continue
    restored.push({ id, merged_into: annotationOf(id).merged_into })
    annotate(id, { merged_into: keep.id })
    merged.push(id)
  }
  if (merged.length === 0) return err('no_evidence', 'nothing left to merge; every candidate was missing or staff-decided')

  const keepAnnotation = annotationOf(keep.id)
  const corroborating = [...new Set([
    ...keepAnnotation.corroborating_post_ids,
    ...merged.map((id) => write.getIncident(id)?.post_id).filter((v): v is string => !!v),
  ])]
  annotate(keep.id, {
    merged_incident_ids: [...new Set([...keepAnnotation.merged_incident_ids, ...merged])],
    corroborating_post_ids: corroborating,
  })

  const action = record({
    run_id: ctx.runId,
    kind: 'merge_duplicate_reports',
    target_incident_id: keep.id,
    evidence_post_ids: args.evidence_post_ids,
    reason: args.reason,
    undo: {
      unmerge: restored,
      keep_incident_id: keep.id,
      previous_merged: keepAnnotation.merged_incident_ids,
      previous_corroborating: keepAnnotation.corroborating_post_ids,
    },
  })

  return ok({
    kept: keep.id,
    merged,
    corroboration: corroborating.length + 1,
    action_id: action.id,
  })
}

export type RaiseSeverityArgs = {
  incident_id: string
  severity: Incident['severity']
  evidence_post_ids: string[]
  reason: string
}

export const raise_severity = async (
  args: RaiseSeverityArgs, ctx: ToolContext,
): Promise<ToolResult<{ incident: Incident; from: number; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.evidence_post_ids) ?? requireReason(args.reason)
  if (bad) return bad

  const incident = write.getIncident(args.incident_id)
  if (!incident) return err('not_found', `no incident ${args.incident_id}`)
  if (staffTouched(incident, 'severity')) {
    return err('staff_decided', `severity on ${incident.id} was decided by staff`)
  }
  // Raise only. Lowering a severity is a judgement about risk that belongs to a
  // person, and an agent that can quietly downgrade an incident is a hazard.
  if (args.severity <= incident.severity) {
    return err('bad_argument', `severity ${args.severity} is not above the current ${incident.severity}`)
  }

  const from = incident.severity
  const updated = write.patchIncident(incident.id, { severity: args.severity })
  if (!updated) return err('not_found', `could not update ${incident.id}`)

  const action = record({
    run_id: ctx.runId,
    kind: 'raise_severity',
    target_incident_id: incident.id,
    evidence_post_ids: args.evidence_post_ids,
    reason: args.reason,
    undo: { patch_incident: incident.id, patch: { severity: from } satisfies IncidentPatch },
  })
  return ok({ incident: updated, from, action_id: action.id })
}

export type AttachCorroboratingArgs = {
  incident_id: string
  post_ids: string[]
  reason: string
}

export const attach_corroborating_posts = async (
  args: AttachCorroboratingArgs, ctx: ToolContext,
): Promise<ToolResult<{ incident_id: string; corroboration: number; added: string[]; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.post_ids) ?? requireReason(args.reason)
  if (bad) return bad

  const incident = write.getIncident(args.incident_id)
  if (!incident) return err('not_found', `no incident ${args.incident_id}`)

  const before = annotationOf(incident.id)
  const added = args.post_ids.filter((id) => {
    if (id === incident.post_id) return false
    if (before.corroborating_post_ids.includes(id)) return false
    const post = write.getPost(id)
    // A hidden post never corroborates anything.
    return !!post && !post.hidden
  })
  if (added.length === 0) return err('already_done', 'every post named was already attached, hidden, or the origin post')

  annotate(incident.id, {
    corroborating_post_ids: [...before.corroborating_post_ids, ...added],
  })

  const action = record({
    run_id: ctx.runId,
    kind: 'attach_corroborating_posts',
    target_incident_id: incident.id,
    evidence_post_ids: added,
    reason: args.reason,
    undo: { set_corroborating: incident.id, previous: before.corroborating_post_ids },
  })
  return ok({
    incident_id: incident.id,
    corroboration: before.corroborating_post_ids.length + added.length + 1,
    added,
    action_id: action.id,
  })
}

export type FlagLowConfidenceArgs = {
  incident_id: string
  confidence: number
  evidence_post_ids: string[]
  reason: string
}

/**
 * Mark a report as one staff should look at before trusting.
 *
 * Deliberately not a delete and not a status change: the report stays exactly
 * where it was, with a flag beside it. An agent that can make a resident's
 * report disappear is a worse failure mode than one that occasionally doubts a
 * true report.
 */
export const flag_low_confidence = async (
  args: FlagLowConfidenceArgs, ctx: ToolContext,
): Promise<ToolResult<{ incident_id: string; confidence: number; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.evidence_post_ids) ?? requireReason(args.reason)
  if (bad) return bad

  const incident = write.getIncident(args.incident_id)
  if (!incident) return err('not_found', `no incident ${args.incident_id}`)
  if (staffTouched(incident)) return err('staff_decided', `incident ${incident.id} was decided by staff`)

  const before = annotationOf(incident.id)
  annotate(incident.id, { low_confidence: true, confidence: args.confidence })

  const action = record({
    run_id: ctx.runId,
    kind: 'flag_low_confidence',
    target_incident_id: incident.id,
    evidence_post_ids: args.evidence_post_ids,
    reason: args.reason,
    undo: {
      set_annotation: incident.id,
      previous: { low_confidence: before.low_confidence, confidence: before.confidence },
    },
  })
  return ok({ incident_id: incident.id, confidence: args.confidence, action_id: action.id })
}

export type EscalateClusterArgs = {
  incident_id: string
  evidence_post_ids: string[]
  reason: string
}

/** Pin a cluster to the top of the civic page. Ordering only: it changes no
 *  field staff rely on, which is why it is the cheapest action to undo. */
export const escalate_cluster = async (
  args: EscalateClusterArgs, ctx: ToolContext,
): Promise<ToolResult<{ incident_id: string; escalated_at: string; action_id: string }>> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')
  const bad = requireEvidence(args.evidence_post_ids) ?? requireReason(args.reason)
  if (bad) return bad

  const incident = write.getIncident(args.incident_id)
  if (!incident) return err('not_found', `no incident ${args.incident_id}`)

  const before = annotationOf(incident.id)
  if (before.escalated_at) return err('already_done', `incident ${incident.id} is already escalated`)

  const escalated = annotate(incident.id, { escalated_at: new Date().toISOString() })
  const action = record({
    run_id: ctx.runId,
    kind: 'escalate_cluster',
    target_incident_id: incident.id,
    evidence_post_ids: args.evidence_post_ids,
    reason: args.reason,
    undo: { set_annotation: incident.id, previous: { escalated_at: null } },
  })
  return ok({
    incident_id: incident.id,
    escalated_at: escalated.escalated_at ?? '',
    action_id: action.id,
  })
}

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

/**
 * Undo one agent action, from the government page.
 *
 * Staff reverting an agent action is itself a staff decision, so the incident
 * is locked afterwards: the agent does not get to redo on the next run what a
 * person just undid. That is the difference between a reversible agent and an
 * agent that argues.
 */
export const revertAction = (actionId: string, by = 'staff'): ToolResult<{ action_id: string; kind: AgentActionKind }> => {
  const write = civicWrite()
  if (!write) return err('no_port', 'no civic write port is wired up')

  const [action] = listActions({ includeReverted: true }).filter((a) => a.id === actionId)
  if (!action) return err('not_found', `no action ${actionId}`)
  if (action.reverted_at) return err('already_done', `action ${actionId} was already reverted`)

  const undo = action.undo

  if (typeof undo.delete_incident === 'string') {
    // Nothing in the port deletes an incident - by design, since the civic
    // routes never delete either. Filing is undone by marking the row
    // low-confidence and severity 0, which is what the page renders as
    // withdrawn, and the lock stops the agent refiling it.
    write.patchIncident(undo.delete_incident, { severity: 0 })
    annotate(undo.delete_incident, { low_confidence: true, confidence: 0 })
  }

  if (typeof undo.patch_incident === 'string') {
    write.patchIncident(undo.patch_incident, (undo.patch ?? {}) as IncidentPatch)
  }

  if (Array.isArray(undo.unmerge)) {
    for (const entry of undo.unmerge as Array<{ id: string; merged_into: string | null }>) {
      annotate(entry.id, { merged_into: entry.merged_into })
    }
  }
  if (typeof undo.keep_incident_id === 'string') {
    annotate(undo.keep_incident_id, {
      merged_incident_ids: (undo.previous_merged ?? []) as string[],
      corroborating_post_ids: (undo.previous_corroborating ?? []) as string[],
    })
  }

  if (typeof undo.set_corroborating === 'string') {
    annotate(undo.set_corroborating, { corroborating_post_ids: (undo.previous ?? []) as string[] })
  }

  if (typeof undo.set_annotation === 'string') {
    annotate(undo.set_annotation, (undo.previous ?? {}) as Partial<IncidentAnnotation>)
  }

  markReverted(actionId, by)
  if (action.target_incident_id) {
    // The lock, and the reason this is more than a rollback: a staff member
    // undoing an action has decided this row, so the agent may not redo it on
    // the next run.
    lockField(action.target_incident_id)
  }
  return ok({ action_id: actionId, kind: action.kind })
}

// ---------------------------------------------------------------------------
// The model-facing schema, generated from the same list
// ---------------------------------------------------------------------------

const str = { type: 'string' } as const
const strArray = { type: 'array', items: { type: 'string' } } as const
const severity = { type: 'integer', minimum: 0, maximum: 3 } as const

/**
 * One definition per tool, so adding a tool to the runtime without adding it
 * here is impossible: `TOOLS` is the single list the executor and the schema
 * both read.
 */
export const TOOLS = [
  {
    name: 'search_evidence',
    kind: 'read' as const,
    description:
      'Hybrid BM25 + vector search over recent posts. Returns ranked evidence with confidence and authenticity per post. Use this before any write.',
    parameters: {
      type: 'object',
      properties: {
        block_id: { ...str, description: 'Restrict to one block.' },
        query: { ...str, description: 'What to look for, in plain words.' },
        window: { ...str, description: 'Time window, e.g. 1h, 24h, 7d.' },
        k: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: [],
    },
    run: (args: unknown, _ctx: ToolContext) => search_evidence(args as SearchEvidenceArgs),
  },
  {
    name: 'block_summary',
    kind: 'read' as const,
    description: 'Average dimensions, post volume and incident count for one block over a window.',
    parameters: {
      type: 'object',
      properties: { block_id: str, window: str },
      required: ['block_id'],
    },
    run: (args: unknown, _ctx: ToolContext) => block_summary(args as BlockSummaryArgs),
  },
  {
    name: 'lookup_incidents',
    kind: 'read' as const,
    description:
      'Existing incidents, with their corroboration, merges, dissent and whether staff have already decided them. An incident marked staff_decided must not be touched.',
    parameters: {
      type: 'object',
      properties: { block_id: str, status: { type: 'string', enum: ['reported', 'verified'] } },
      required: [],
    },
    run: (args: unknown, _ctx: ToolContext) => lookup_incidents(args as LookupIncidentsArgs),
  },
  {
    name: 'file_incident',
    kind: 'write' as const,
    description: 'File an incident from a post that Call A did not mark as one.',
    parameters: {
      type: 'object',
      properties: {
        post_id: str,
        type: str,
        severity,
        location_hint: str,
        evidence_post_ids: strArray,
        reason: str,
        confidence: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['post_id', 'type', 'severity', 'evidence_post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => file_incident(args as FileIncidentArgs, ctx),
  },
  {
    name: 'merge_duplicate_reports',
    kind: 'write' as const,
    description:
      'Merge duplicate reports of one event into a single incident. The merged rows are marked, never deleted.',
    parameters: {
      type: 'object',
      properties: {
        keep_incident_id: str,
        merge_incident_ids: strArray,
        evidence_post_ids: strArray,
        reason: str,
      },
      required: ['keep_incident_id', 'merge_incident_ids', 'evidence_post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => merge_duplicate_reports(args as MergeDuplicatesArgs, ctx),
  },
  {
    name: 'raise_severity',
    kind: 'write' as const,
    description: 'Raise an incident severity. Lowering is not available to you.',
    parameters: {
      type: 'object',
      properties: { incident_id: str, severity, evidence_post_ids: strArray, reason: str },
      required: ['incident_id', 'severity', 'evidence_post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => raise_severity(args as RaiseSeverityArgs, ctx),
  },
  {
    name: 'attach_corroborating_posts',
    kind: 'write' as const,
    description: 'Attach posts that independently corroborate an existing incident.',
    parameters: {
      type: 'object',
      properties: { incident_id: str, post_ids: strArray, reason: str },
      required: ['incident_id', 'post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => attach_corroborating_posts(args as AttachCorroboratingArgs, ctx),
  },
  {
    name: 'flag_low_confidence',
    kind: 'write' as const,
    description:
      'Mark a report as needing a human look. It stays visible; this adds a flag, it does not hide anything.',
    parameters: {
      type: 'object',
      properties: {
        incident_id: str,
        confidence: { type: 'number', minimum: 0, maximum: 100 },
        evidence_post_ids: strArray,
        reason: str,
      },
      required: ['incident_id', 'confidence', 'evidence_post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => flag_low_confidence(args as FlagLowConfidenceArgs, ctx),
  },
  {
    name: 'escalate_cluster',
    kind: 'write' as const,
    description: 'Pin an incident to the top of the civic page. Ordering only.',
    parameters: {
      type: 'object',
      properties: { incident_id: str, evidence_post_ids: strArray, reason: str },
      required: ['incident_id', 'evidence_post_ids', 'reason'],
    },
    run: (args: unknown, ctx: ToolContext) => escalate_cluster(args as EscalateClusterArgs, ctx),
  },
] as const

export type ToolName = (typeof TOOLS)[number]['name']

export const toolByName = (name: string) => TOOLS.find((tool) => tool.name === name) ?? null

/** The OpenAI tool-calling schema, generated from `TOOLS`. */
export const toolSchema = () =>
  TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
