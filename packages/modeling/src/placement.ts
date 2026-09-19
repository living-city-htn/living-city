/**
 * The clipped-grid placement engine from docs/02 section 4.5.
 *
 * Deterministic and pure: the same plan and the same community id always
 * produce the same block, which is what docs/02 section 9 means by replay.
 * No geometry library, no React, nothing to render — the renderer turns these
 * cells into meshes.
 *
 * "That is the whole algorithm; do not refine it before Gate 3."
 * (docs/roles/3d.md, Stage 1.)
 */

export type Cell = {
  /** Metres from the block centroid, x east and y north. */
  x: number
  y: number
  size: number
  kind: 'building' | 'vegetation' | 'plaza'
  /** One of the six composition categories, for buildings. */
  category?: string
  /** Storeys, already capped by the block's height tier. */
  storeys?: number
  /** 0..1, so the renderer can vary a species or a tint without more RNG. */
  variant: number
}

export type PlacementInput = {
  communityId: string
  /** The block outline in lon/lat, first ring only. */
  ring: Array<[number, number]>
  centroid: [number, number]
  lotCount: number
  maxHeightTier: number
  density: number
  composition: Record<string, number>
  heightProfile: string
  vegetationLevel: number
  crowdClusters: number
}

/** Small, fast, seeded. Same seed, same city, every time. */
function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const M_PER_DEG_LAT = 111_320

/** lon/lat to metres from the centroid. Flat earth is fine over one block. */
export function toLocalMetres(
  [lon, lat]: [number, number],
  [clon, clat]: [number, number],
): [number, number] {
  const k = Math.cos((clat * Math.PI) / 180)
  return [(lon - clon) * M_PER_DEG_LAT * k, (lat - clat) * M_PER_DEG_LAT]
}

/** Ray casting. The ring may or may not repeat its first point. */
export function inside(px: number, py: number, ring: Array<[number, number]>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const [xi, yi] = a
    const [xj, yj] = b
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const STOREYS: Record<string, [number, number]> = {
  low: [1, 2],
  low_mid: [2, 4],
  mid: [4, 7],
  mid_high: [7, 11],
  high: [11, 18],
}

/** Density 1..5 maps to the share of cells that carry a building. */
const buildingShare = (density: number) => 0.18 + Math.min(Math.max(density, 1), 5) * 0.13

export function placeBlock(input: PlacementInput): Cell[] {
  const ring = input.ring.map((p) => toLocalMetres(p, input.centroid))
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  // Cell size chosen so the kept cells land near the block's lot count.
  const area = (maxX - minX) * (maxY - minY)
  const step = Math.max(8, Math.sqrt(area / Math.max(input.lotCount, 1)) * 0.92)
  const gap = step * 0.18

  const kept: Array<{ x: number; y: number; d: number }> = []
  for (let y = minY + step / 2; y <= maxY; y += step) {
    for (let x = minX + step / 2; x <= maxX; x += step) {
      // Shrunk from the edge so nothing hangs over the slab.
      if (!inside(x, y, ring)) continue
      if (!inside(x + step * 0.42, y, ring) || !inside(x - step * 0.42, y, ring)) continue
      if (!inside(x, y + step * 0.42, ring) || !inside(x, y - step * 0.42, ring)) continue
      kept.push({ x, y, d: Math.hypot(x, y) })
    }
  }
  if (kept.length === 0) return []

  const random = rng(input.communityId)
  // Stable order before any sampling, so the RNG stream is reproducible.
  kept.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y)

  const range = STOREYS[input.heightProfile] ?? STOREYS.low ?? [1, 2]
  const [lo, hi] = range
  const cap = Math.max(1, input.maxHeightTier * 3)

  const entries = Object.entries(input.composition).filter(([, n]) => n > 0)
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1
  const pickCategory = () => {
    let roll = random() * total
    for (const [name, n] of entries) {
      roll -= n
      if (roll <= 0) return name
    }
    return entries[0]?.[0] ?? 'residential'
  }

  const wanted = Math.round(kept.length * buildingShare(input.density))
  const cells: Cell[] = []

  kept.forEach((c, i) => {
    const size = step - gap
    // The plaza is the cell nearest the centroid; crowds and the hero go here.
    if (i === 0 && input.crowdClusters > 0) {
      cells.push({ x: c.x, y: c.y, size, kind: 'plaza', variant: random() })
      return
    }
    if (cells.filter((k) => k.kind === 'building').length < wanted) {
      const storeys = Math.min(cap, Math.round(lo + random() * (hi - lo)))
      cells.push({ x: c.x, y: c.y, size, kind: 'building', category: pickCategory(), storeys, variant: random() })
      return
    }
    if (random() < input.vegetationLevel / 5) {
      cells.push({ x: c.x, y: c.y, size, kind: 'vegetation', variant: random() })
    }
  })

  return cells
}
