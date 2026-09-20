type PostInput = {
  text: string; image_url: string | null; audio_url: string | null; community_id?: string
  lon?: number; lat?: number; is_incident_report?: boolean
}

/**
 * Server-side audio ceiling. The composer enforces MAX_AUDIO_BYTES on the raw
 * blob; this is the same cap measured on the base64 payload, which is about a
 * third larger. Both are needed: the client cap is a courtesy, this one is the
 * rule. docs/08 section 3.
 */
export const MAX_AUDIO_DATA_URL_LENGTH = 6 * 1024 * 1024
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
  // A voice note never makes a post valid on its own and never makes one
  // invalid: a rejected clip drops to null and the caption posts regardless.
  const audioRaw = b.audio_url ?? null
  const audio = typeof audioRaw === 'string'
    && audioRaw.length <= MAX_AUDIO_DATA_URL_LENGTH
    && /^data:audio\/(webm|mp4|ogg)(;[\w=-]+)*;base64,[A-Za-z0-9+/]+=*$/.test(audioRaw)
    ? audioRaw
    : null
  const id = b.community_id
  if (id !== undefined && (typeof id !== 'string' || !communities.includes(id))) return fail('Choose a community from the map.')
  const hasCoordinates = b.lon !== undefined || b.lat !== undefined
  if (hasCoordinates && (typeof b.lon !== 'number' || !Number.isFinite(b.lon) || Math.abs(b.lon) > 180 ||
      typeof b.lat !== 'number' || !Number.isFinite(b.lat) || Math.abs(b.lat) > 90)) return fail('That location is not valid. Choose a block instead.')
  if (!id && !hasCoordinates) return fail('Choose where this happened.')
  return { ok: true, value: { text, image_url: image as string | null, audio_url: audio,
    community_id: id as string | undefined, lon: b.lon as number | undefined,
    lat: b.lat as number | undefined, is_incident_report: b.is_incident_report === true } }
}
