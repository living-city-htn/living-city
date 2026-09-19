/**
 * lon/lat <-> SVG viewBox, for the fallback scene only.
 *
 * This file dies with the fallback. 3D's component has its own projection into
 * world space; neither one is allowed to leak past the props in ./types.ts.
 *
 * Equirectangular with a cos(lat) correction, which is right enough over a city
 * a few kilometres across and keeps the inverse trivial.
 */
import type { CommunityGeo } from '@living-city/fixtures'

export const VIEW = 1000
const PAD = 40

export type Point = [number, number]

export type Projection = {
  toSvg: (lon: number, lat: number) => Point
  toLonLat: (x: number, y: number) => Point
  /** viewBox sized to the city's own bounds, so no aspect ratio is imposed on it. */
  width: number
  height: number
}

/** GeoJSON rings are typed `number[][]`, so narrow to real pairs once, here. */
function ringOf(community: CommunityGeo): Point[] {
  const ring = community.polygon_block.coordinates[0] ?? []
  const out: Point[] = []
  for (const p of ring) {
    const [lon, lat] = p
    if (typeof lon === 'number' && typeof lat === 'number') out.push([lon, lat])
  }
  return out
}

const extent = (values: number[]) => {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 }
}

export function buildProjection(communities: CommunityGeo[]): Projection {
  const points = communities.flatMap(ringOf)
  const lat = extent(points.map((p) => p[1]))
  const lat0 = (lat.min + lat.max) / 2
  const k = Math.cos((lat0 * Math.PI) / 180) || 1

  // Flat space: x east, y north. The SVG flips y further down.
  const x = extent(points.map((p) => p[0] * k))
  const y = lat

  const span = Math.max(x.max - x.min, y.max - y.min) || 1
  const scale = (VIEW - PAD * 2) / span
  const width = (x.max - x.min) * scale + PAD * 2
  const height = (y.max - y.min) * scale + PAD * 2

  return {
    width,
    height,
    toSvg: (lon, latitude) => [
      PAD + (lon * k - x.min) * scale,
      height - PAD - (latitude - y.min) * scale,
    ],
    toLonLat: (svgX, svgY) => [
      (x.min + (svgX - PAD) / scale) / k,
      y.min + (height - PAD - svgY) / scale,
    ],
  }
}

/** A block's projected outline, plus the centroid and half-extents slots hang off. */
export function projectBlock(community: CommunityGeo, p: Projection) {
  const ring = ringOf(community).map(([lon, lat]) => p.toSvg(lon, lat))
  const x = extent(ring.map((q) => q[0]))
  const y = extent(ring.map((q) => q[1]))
  return {
    d:
      ring
        .map((q, i) => `${i === 0 ? 'M' : 'L'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`)
        .join(' ') + ' Z',
    cx: (x.min + x.max) / 2,
    cy: (y.min + y.max) / 2,
    halfW: (x.max - x.min) / 2,
    halfH: (y.max - y.min) / 2,
  }
}
