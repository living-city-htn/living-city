import type { Incident, Post, PostAnalysis } from '@living-city/contracts'

export type IncidentPost = Pick<Post, 'id' | 'hidden' | 'created_at'> & {
  community_id: string
}

export type IncidentAnalysis = Pick<PostAnalysis, 'incident'>

export type IncidentFilter = {
  community?: string
  type?: Incident['type']
  status?: Incident['status']
  from?: string
  to?: string
}

export type CivicOptions = {
  now?: () => string
  initial?: readonly Incident[]
}

const copy = <T>(value: T): T => ({ ...value })

/**
 * Temporary persistence for Stage 2 while the Pipeline-owned database
 * migrations are unavailable. The public methods mirror the future database
 * boundary: hidden posts have no incident, and the only status transition is
 * to verified.
 */
export const createInMemoryCivic = (options: CivicOptions = {}) => {
  const now = options.now ?? (() => new Date().toISOString())
  const incidents = [...(options.initial ?? [])].map(copy)

  const list = (filter: IncidentFilter = {}) => incidents
    .filter((incident) =>
      (!filter.community || incident.community_id === filter.community)
      && (!filter.type || incident.type === filter.type)
      && (!filter.status || incident.status === filter.status)
      && (!filter.from || incident.reported_at >= filter.from)
      && (!filter.to || incident.reported_at <= filter.to),
    )
    .map(copy)

  return {
    list,

    record: (post: IncidentPost, analysis: IncidentAnalysis): Incident | null => {
      if (post.hidden || analysis.incident.type === 'none') return null
      const existing = incidents.find((incident) => incident.post_id === post.id)
      if (existing) return copy(existing)

      const incident: Incident = {
        id: `incident:${post.id}`,
        post_id: post.id,
        community_id: post.community_id,
        type: analysis.incident.type,
        severity: analysis.incident.severity,
        location_hint: analysis.incident.location_hint,
        reported_at: post.created_at,
        source: 'post',
        status: 'reported',
        staff_note: null,
        updated_at: post.created_at,
      }
      incidents.push(incident)
      return copy(incident)
    },

    verify: (incidentId: string, staffNote?: string): Incident | null => {
      const incident = incidents.find((candidate) => candidate.id === incidentId)
      if (!incident) return null
      incident.status = 'verified'
      if (staffNote !== undefined) incident.staff_note = staffNote
      incident.updated_at = now()
      return copy(incident)
    },

    removeForPost: (postId: string) => {
      const index = incidents.findIndex((incident) => incident.post_id === postId)
      if (index < 0) return false
      incidents.splice(index, 1)
      return true
    },
  }
}
