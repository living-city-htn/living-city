import { listIncidents, listPosts, read } from '@living-city/fixtures/store'
import { json, requireGovernment } from '@/lib/stub'

// GET /api/civic/incidents?community=&type=&status=
// Role-gated to government in the real build; the gate is Civic's, from Stage 1.
export async function GET(req: Request) {
  const user = requireGovernment(req)
  if (user instanceof Response) return user
  const { searchParams } = new URL(req.url)
  const filters = {
    community: searchParams.get('community') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  }
  return json({
    incidents: await read(() => listIncidents(filters).map((incident) => {
      const post = listPosts({ includeHidden: true }).find((candidate) => candidate.id === incident.post_id)
      return {
        ...incident,
        post: post ? {
          text: post.text,
          image_url: post.image_url,
        } : null,
      }
    })),
  })
}
