import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { log } from '../log'
import type { ImagePart } from '../provider/types'
import type { ImageState } from './validate'

/**
 * Turn whatever the post carries as an image into inline bytes for Call A.
 *
 * Three sources, because the image arrives differently at each stage of the
 * weekend: a Blob URL in production, a data URL straight off the phone before
 * upload lands, and a repo-relative path for the seed posts in
 * `packages/fixtures`.
 *
 * Failure is never fatal. docs/03 rule 9: if the image is unavailable, proceed
 * on text alone and let the validator add `image_missing`.
 */

/** Well under the provider's inline-data ceiling; a phone photo is ~2-4 MB. */
const MAX_BYTES = 6 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8000

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.heic': 'image/heic', '.gif': 'image/gif',
}

const mimeFromPath = (path: string): string => {
  const dot = path.lastIndexOf('.')
  return (dot >= 0 ? EXT_MIME[path.slice(dot).toLowerCase()] : undefined) ?? 'image/jpeg'
}

const fromDataUrl = (url: string): ImagePart | null => {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(url)
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], data: match[2] }
}

const fromRemote = async (url: string): Promise<ImagePart | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      log.warn('image.fetch_failed', { url, status: response.status })
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      log.warn('image.too_large', { url, bytes: buffer.byteLength })
      return null
    }
    return {
      mimeType: response.headers.get('content-type')?.split(';')[0] ?? mimeFromPath(url),
      data: buffer.toString('base64'),
    }
  } catch (error) {
    log.warn('image.fetch_error', { url, message: error instanceof Error ? error.message : String(error) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A seed post's `/seed/foo.jpg` is a path into the web app's public directory,
 * not a URL. Only used off-server, by the CLI runners.
 */
const fromLocal = async (path: string, publicDir: string): Promise<ImagePart | null> => {
  try {
    const buffer = await readFile(resolve(publicDir, path.replace(/^\//, '')))
    if (buffer.byteLength > MAX_BYTES) {
      log.warn('image.too_large', { path, bytes: buffer.byteLength })
      return null
    }
    return { mimeType: mimeFromPath(path), data: buffer.toString('base64') }
  } catch {
    return null
  }
}

export type ResolveImageOptions = {
  /** Where a root-relative path like `/seed/x.jpg` lives on disk. */
  publicDir?: string
  /** Absolute base for root-relative paths when running against a server. */
  baseUrl?: string
}

export const resolveImage = async (
  source: string | null | undefined,
  options: ResolveImageOptions = {},
): Promise<{ image: ImagePart | null; state: ImageState }> => {
  if (!source) return { image: null, state: 'none' }

  if (source.startsWith('data:')) {
    const image = fromDataUrl(source)
    return image ? { image, state: 'present' } : { image: null, state: 'missing' }
  }

  if (/^https?:\/\//i.test(source)) {
    const image = await fromRemote(source)
    return image ? { image, state: 'present' } : { image: null, state: 'missing' }
  }

  if (options.publicDir) {
    const image = await fromLocal(source, options.publicDir)
    if (image) return { image, state: 'present' }
  }
  if (options.baseUrl) {
    const image = await fromRemote(new URL(source, options.baseUrl).toString())
    if (image) return { image, state: 'present' }
  }

  // A path we cannot resolve is the same thing as an image that failed to
  // load: analyse the text and flag it.
  return { image: null, state: 'missing' }
}
