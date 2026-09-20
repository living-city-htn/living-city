import { describe, expect, it } from 'vitest'
import { decodeImageDataUrl, imageKey, storeImage } from './post-image-blob'

const dataUrl = (mimeType: string, bytes: number[]) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`

const jpeg = dataUrl('image/jpeg', [0xff, 0xd8, 0xff, 0xdb, 0x00])

describe('imageKey', () => {
  it('names the post, so a public photo is traceable to its post', () => {
    expect(imageKey('p-42', 'image/jpeg')).toBe('posts/p-42/photo.jpg')
    expect(imageKey('p-42', 'image/png')).toBe('posts/p-42/photo.png')
    expect(imageKey('p-42', 'image/webp')).toBe('posts/p-42/photo.webp')
  })
})

describe('decodeImageDataUrl', () => {
  it('accepts an allowed image with matching file bytes', () => {
    const decoded = decodeImageDataUrl(jpeg)
    expect(decoded?.mimeType).toBe('image/jpeg')
    expect(decoded?.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })

  it('rejects a photo whose declared type does not match its bytes', () => {
    const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    expect(decodeImageDataUrl(dataUrl('image/jpeg', pngBytes))).toBeNull()
  })
})

describe('storeImage without a Blob token', () => {
  it('keeps a validated photo inline so Call A can still see it', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN

    const stored = await storeImage('p-7', jpeg)

    expect(stored).toEqual({
      url: jpeg,
      key: null,
      mimeType: 'image/jpeg',
      bytes: 5,
    })
  })
})
