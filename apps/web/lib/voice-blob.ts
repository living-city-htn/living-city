/**
 * Where a voice note lives, and for how long. docs/08 section 3.
 *
 * Audio goes to the same Vercel Blob store as post photos are destined for,
 * under a key that names its post, so a clip found in the store can always be
 * traced back to what it belongs to and removed with it.
 *
 * RETENTION IS THE DECISION THAT MATTERS HERE. A recording of someone's voice
 * in a public square is more identifying than a photo of the square: it carries
 * who they are, not just where they stood. So the default deletes the audio as
 * soon as the transcript exists, and the transcript is what the demo keeps.
 * Change the one constant below to keep clips, and say so out loud if you do.
 *
 * With no BLOB_READ_WRITE_TOKEN set, storage falls back to passing the inline
 * data URL straight through. That is what makes the whole voice path runnable
 * on venue wifi with no keys and no network.
 */

/** The server half of the flag. The composer reads NEXT_PUBLIC_VOICE_POSTS. */
export const VOICE_POSTS = process.env.VOICE_POSTS === '1'

/** The one retention switch. docs/08 section 3. */
export const AUDIO_RETENTION: 'delete-after-transcript' | 'keep' = 'delete-after-transcript'

export type StoredAudio = {
  /** Where OMNI reads it from: a Blob URL, or the inline data URL offline. */
  url: string
  /** Blob key, null when the clip was never uploaded. Null means nothing to delete. */
  key: string | null
  mimeType: string
  bytes: number
}

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
}

/**
 * `posts/<post_id>/voice.<ext>`.
 *
 * The post id is the whole point: the demo's fuse is the operator hiding a
 * post, and a key shaped like this makes "delete what belongs to that post" a
 * prefix, not a search.
 */
export const audioKey = (postId: string, mimeType: string): string => {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  return `posts/${postId}/voice.${EXTENSIONS[base] ?? 'webm'}`
}

/** Splits a `data:audio/...;base64,...` URL. Null when it is not one. */
export const decodeAudioDataUrl = (
  dataUrl: string,
): { mimeType: string; bytes: Buffer } | null => {
  const match = /^data:(audio\/[\w.+-]+(?:;[\w=-]+)*);base64,(.+)$/.exec(dataUrl)
  if (!match?.[1] || !match[2]) return null
  try {
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length === 0) return null
    return { mimeType: match[1], bytes }
  } catch {
    return null
  }
}

/** True when a real Blob store is configured. Off on venue wifi, and that is fine. */
export const blobConfigured = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN

/**
 * Put the clip somewhere OMNI can read it.
 *
 * Never throws. An upload that fails returns the inline data URL instead, so a
 * broken Blob store costs the post nothing: rung 2 of the ladder handles the
 * consequence if OMNI then cannot read it.
 */
export const storeAudio = async (
  postId: string, dataUrl: string,
): Promise<StoredAudio | null> => {
  const decoded = decodeAudioDataUrl(dataUrl)
  if (!decoded) return null

  const inline: StoredAudio = {
    url: dataUrl, key: null, mimeType: decoded.mimeType, bytes: decoded.bytes.length,
  }
  if (!blobConfigured()) return inline

  const key = audioKey(postId, decoded.mimeType)
  try {
    // Imported here rather than at the top so the app runs, and this file's
    // tests pass, in a checkout where @vercel/blob was never installed.
    const { put } = await import('@vercel/blob')
    const result = await put(key, decoded.bytes, {
      access: 'public',
      contentType: decoded.mimeType,
      addRandomSuffix: false,
    })
    return { url: result.url, key, mimeType: decoded.mimeType, bytes: decoded.bytes.length }
  } catch {
    return inline
  }
}

/**
 * Honour the retention decision once the transcript is stored.
 *
 * Never throws and is never awaited on the critical path. A clip that outlives
 * its transcript because a delete failed is a privacy problem, not a demo
 * problem, so the failure is logged where the operator can see it.
 */
export const discardAudio = async (stored: StoredAudio | null): Promise<void> => {
  if (!stored?.key || AUDIO_RETENTION !== 'delete-after-transcript') return
  try {
    const { del } = await import('@vercel/blob')
    await del(stored.url)
  } catch {
    console.warn(JSON.stringify({
      at: 'voice.retention', event: 'delete_failed', key: stored.key,
      note: 'audio outlived its transcript, remove it by hand',
    }))
  }
}
