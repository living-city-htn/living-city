/**
 * Generates the PWA icons as real PNG files, with no image dependency.
 *
 * The icon is the city seen from above: a dark field with a few light blocks
 * stepping across it, which is the same idea as the app's own map. Kept to flat
 * rectangles on purpose (apps/web/DESIGN.md: the chrome is quiet).
 *
 * Run: node scripts/make-icons.mjs
 * The output is committed, so this only runs when the mark changes.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba is a (x, y) => [r, g, b, a] sampler. */
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let i = 0
  for (let y = 0; y < size; y++) {
    raw[i++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgba(x, y)
      raw[i++] = r
      raw[i++] = g
      raw[i++] = b
      raw[i++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FIELD = [13, 13, 15]
const BLOCKS = [
  // x, y, w, h as fractions of the icon, stepping the way the city does.
  { x: 0.16, y: 0.2, w: 0.26, h: 0.26, c: [206, 216, 228] },
  { x: 0.41, y: 0.33, w: 0.26, h: 0.26, c: [214, 226, 212] },
  { x: 0.25, y: 0.5, w: 0.26, h: 0.26, c: [232, 219, 203] },
  { x: 0.55, y: 0.56, w: 0.26, h: 0.26, c: [223, 221, 228] },
]

/** `inset` leaves room for the safe zone a maskable icon is cropped to. */
function sampler(size, { inset = 0, transparent = false } = {}) {
  const s = 1 - inset * 2
  const radius = size * 0.22
  return (x, y) => {
    const u = (x / size - inset) / s
    const v = (y / size - inset) / s
    if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0, 0]

    // Rounded square field, or a full bleed one when the platform masks it.
    if (!transparent) {
      const px = u * size
      const py = v * size
      const dx = Math.max(radius - px, 0, px - (size - radius))
      const dy = Math.max(radius - py, 0, py - (size - radius))
      if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0]
    }

    for (const b of BLOCKS) {
      if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) {
        const edge =
          u - b.x < 0.012 || b.x + b.w - u < 0.012 || v - b.y < 0.012 || b.y + b.h - v < 0.012
        return edge ? [250, 250, 252, 255] : [...b.c, 255]
      }
    }
    return [...FIELD, 255]
  }
}

const files = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { inset: 0.1, transparent: true }],
  ['apple-touch-icon.png', 180, { transparent: true }],
]

for (const [name, size, opts] of files) {
  writeFileSync(join(OUT, name), png(size, sampler(size, opts)))
  console.log(`wrote ${name} (${size}x${size})`)
}
