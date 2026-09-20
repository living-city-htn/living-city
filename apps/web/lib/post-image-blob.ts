/**
 * Public post photos are kept for the feed and the community's evidence, so
 * they use the same Blob store as the rest of the demo. When Blob is not
 * configured (for local rehearsal or venue fallback), the validated data URL
 * remains inline and is still a supported OpenAI image input for Call A.
 */

export type StoredImage = {
  url: string
  key: string | null
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: number
}

const EXTENSIONS: Record<StoredImage['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** The request parser caps the base64 URL at 1.5 MB; keep this boundary too. */
const MAX_IMAGE_BYTES = 1_125_000

const supportedMimeType = (value: string): value is StoredImage['mimeType'] =>
  value === 'image/jpeg' || value === 'image/png' || value === 'image/webp'

const matchesFileSignature = (mimeType: StoredImage['mimeType'], bytes: Buffer): boolean => {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
}

/** `posts/<post_id>/photo.<ext>` makes moderation cleanup traceable. */
export const imageKey = (postId: string, mimeType: StoredImage['mimeType']): string =>
  `posts/${postId}/photo.${EXTENSIONS[mimeType]}`

/**
 * This deliberately accepts only the browser photo formats in post-input.ts.
 * The magic-byte check prevents persisting arbitrary bytes under a photo MIME.
 */
export const decodeImageDataUrl = (
  dataUrl: string,
): { mimeType: StoredImage['mimeType']; bytes: Buffer } | null => {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl)
  if (!match?.[1] || !match[2] || !supportedMimeType(match[1])) return null

  try {
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !matchesFileSignature(match[1], bytes)) return null
    return { mimeType: match[1], bytes }
  } catch {
    return null
  }
}

export const imageBlobConfigured = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN

/**
 * Upload when possible, but never drop the post merely because Blob is down.
 * Call A accepts the inline URL through the existing OpenAI provider path.
 */
export const storeImage = async (
  postId: string,
  dataUrl: string,
): Promise<StoredImage | null> => {
  const decoded = decodeImageDataUrl(dataUrl)
  if (!decoded) return null

  const inline: StoredImage = {
    url: dataUrl,
    key: null,
    mimeType: decoded.mimeType,
    bytes: decoded.bytes.length,
  }
  if (!imageBlobConfigured()) return inline

  try {
    const { put } = await import('@vercel/blob')
    const result = await put(imageKey(postId, decoded.mimeType), decoded.bytes, {
      access: 'public',
      contentType: decoded.mimeType,
      addRandomSuffix: false,
    })
    return { ...inline, url: result.url, key: imageKey(postId, decoded.mimeType) }
  } catch {
    return inline
  }
}
