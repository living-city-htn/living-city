type PostInput = {
  text: string; image_url: string | null; community_id?: string
  lon?: number; lat?: number; is_incident_report?: boolean
}
export function parsePostInput(value: unknown, communities: string[]):
  { ok: true; value: PostInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  if (!value || typeof value !== 'object') return fail('Please check your post.')
  const b = value as Record<string, unknown>
  if (b.text != null && typeof b.text !== 'string') return fail('Caption must be text.')
  const text = typeof b.text === 'string' ? b.text.trim() : ''
  if (text.length > 1000) return fail('Keep your caption under 1,000 characters.')
  const image = b.image_url ?? null
  if (image !== null && (typeof image !== 'string' || image.length > 1500000 ||
      !/^(https:\/\/|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$)/.test(image))) {
    return fail('Choose a smaller JPEG, PNG or WebP photo.')
  }
  if (!text && !image) return fail('Add a photo or write something first.')
  const id = b.community_id
  if (id !== undefined && (typeof id !== 'string' || !communities.includes(id))) return fail('Choose a community from the map.')
  const hasCoordinates = b.lon !== undefined || b.lat !== undefined
  if (hasCoordinates && (typeof b.lon !== 'number' || !Number.isFinite(b.lon) || Math.abs(b.lon) > 180 ||
      typeof b.lat !== 'number' || !Number.isFinite(b.lat) || Math.abs(b.lat) > 90)) return fail('That location is not valid. Choose a block instead.')
  if (!id && !hasCoordinates) return fail('Choose where this happened.')
  return { ok: true, value: { text, image_url: image as string | null,
    community_id: id as string | undefined, lon: b.lon as number | undefined,
    lat: b.lat as number | undefined, is_incident_report: b.is_incident_report === true } }
}
