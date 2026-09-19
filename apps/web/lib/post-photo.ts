/** Resize before transport; fixture photos stay inline until Pipeline supplies Blob upload. */
export async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo, not another kind of file.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('This photo could not be opened. Try a JPEG or post text only.') })
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable. You can still post text.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL('image/jpeg', 0.75)
    if (result.length > 1500000) throw new Error('This photo is too large. Try a smaller photo or post text only.')
    return result
  } finally { URL.revokeObjectURL(url) }
}
