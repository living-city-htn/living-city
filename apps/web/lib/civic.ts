/**
 * Civic view helpers: filters from a query string, incident rows joined to
 * their source post, and the CSV export. Pure, so they are tested without a
 * server. Nothing here is written by a model: docs/01 section 8.9, "Summaries
 * are computed, not written".
 */
import { incidentLabel, STATUS_LABELS, type IncidentStatus } from './incident-types'

export type IncidentFilterQuery = {
  community?: string
  type?: string
  status?: string
  from?: string
  to?: string
}

/** Relative ranges the dashboard offers, in hours. */
export const RANGES = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const
export type RangeKey = keyof typeof RANGES | 'all'

const isoOrUndefined = (value: string | null): string | undefined => {
  if (!value) return undefined
  const t = Date.parse(value)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/**
 * Reads `community`, `type`, `status`, `from`, `to` and the shorthand
 * `range=24h|7d|30d`. An explicit `from` wins over `range`.
 */
export function filtersFrom(params: URLSearchParams, now = Date.now()): IncidentFilterQuery {
  const range = params.get('range') as RangeKey | null
  const fromRange = range && range in RANGES
    ? new Date(now - RANGES[range as keyof typeof RANGES] * 3_600_000).toISOString()
    : undefined
  const pick = (k: string) => params.get(k) || undefined
  return {
    community: pick('community'),
    type: pick('type'),
    status: pick('status'),
    from: isoOrUndefined(params.get('from')) ?? fromRange,
    to: isoOrUndefined(params.get('to')),
  }
}

export type IncidentRow = {
  id: string
  post_id: string
  community_id: string
  community_name: string
  type: string
  severity: number
  location_hint: string | null
  reported_at: string
  source: string
  status: IncidentStatus
  staff_note: string | null
  updated_at: string
  /** The reporter is never named. docs/01 section 8.9. */
  post: { text: string; image_url: string | null } | null
}

const CSV_COLUMNS: Array<[string, (r: IncidentRow) => string | number | null]> = [
  ['id', (r) => r.id],
  ['reported_at', (r) => r.reported_at],
  ['community_id', (r) => r.community_id],
  ['community', (r) => r.community_name],
  ['type', (r) => incidentLabel(r.type)],
  ['severity', (r) => r.severity],
  ['status', (r) => STATUS_LABELS[r.status] ?? r.status],
  ['location_hint', (r) => r.location_hint],
  ['source', (r) => r.source],
  ['staff_note', (r) => r.staff_note],
  ['post_text', (r) => r.post?.text ?? null],
  ['photo_url', (r) => (r.post?.image_url?.startsWith('data:') ? '(inline photo)' : r.post?.image_url ?? null)],
  ['updated_at', (r) => r.updated_at],
]

/**
 * RFC 4180: quote every field that needs it, double embedded quotes, CRLF rows.
 * A leading =, +, - or @ is prefixed with a quote so a spreadsheet does not run
 * a resident's text as a formula.
 */
export const csvField = (value: string | number | null): string => {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function incidentsCsv(rows: IncidentRow[]): string {
  const head = CSV_COLUMNS.map(([name]) => name).join(',')
  const body = rows.map((r) => CSV_COLUMNS.map(([, get]) => csvField(get(r))).join(','))
  return [head, ...body].join('\r\n') + '\r\n'
}
