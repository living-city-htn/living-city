import { listCommunities, listIncidents, listPosts } from '@living-city/fixtures/store'
import type { IncidentFilterQuery, IncidentRow } from './civic'

/**
 * Incidents joined to their source post and community name, newest first.
 * Must run inside the store's `read` or `write`.
 */
export function incidentRows(filters: IncidentFilterQuery): IncidentRow[] {
  const names = new Map(listCommunities().map((c) => [c.community_id, c.name]))
  const posts = new Map(listPosts({ includeHidden: true }).map((p) => [p.id, p]))
  return listIncidents(filters)
    .map((incident) => {
      const post = posts.get(incident.post_id)
      return {
        ...incident,
        community_name: names.get(incident.community_id) ?? incident.community_id,
        post: post ? { text: post.text, image_url: post.image_url } : null,
      }
    })
    .sort((a, b) => Date.parse(b.reported_at) - Date.parse(a.reported_at))
}
