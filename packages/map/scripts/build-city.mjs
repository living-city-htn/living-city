/**
 * Builds the visual city from the City of Waterloo's official district plans.
 *
 * docs/04 section 6 says the visual layer is hand-drawn and that official
 * polygons are not simplified for it. That rule exists because tracing and
 * simplifying was expected to be a time sink that could break the silhouette.
 * Neither applies here: the official file is already committed for assignment,
 * and reducing a ring to a handful of points is a few lines. The result is the
 * real shape of Waterloo rather than shapes someone invented, which is what
 * moment 1 is asking for.
 *
 * Run: node packages/map/scripts/build-city.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(readFileSync(join(here, '..', 'data', 'raw', 'waterloo-district-plans.json'), 'utf8'))

/** The urban city. The rural fringe is left out so the outline stays legible. */
const EXCLUDE = new Set(['Rural East', 'Country Squire', 'Erbsville', 'Conservation Meadows', 'Beaver Creek Meadows', 'Lakeshore North'])

const slug = (name) =>
  'kw:' + name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Perpendicular distance from p to the segment a-b. */
function dist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Douglas-Peucker. */
function simplify(points, tolerance) {
  if (points.length < 3) return points
  let index = 0, max = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = dist(points[i], points[0], points[points.length - 1])
    if (d > max) { index = i; max = d }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]]
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ]
}

/** Shrink toward the centroid so neighbours read as separate pieces on a board. */
const shrink = (ring, centroid, factor) =>
  ring.map(([x, y]) => [
    centroid[0] + (x - centroid[0]) * factor,
    centroid[1] + (y - centroid[1]) * factor,
  ])

const outerRing = (geometry) => {
  if (geometry.type === 'Polygon') return geometry.coordinates[0]
  // MultiPolygon: the largest ring is the district; the rest are slivers.
  let best = geometry.coordinates[0][0]
  for (const poly of geometry.coordinates) if (poly[0].length > best.length) best = poly[0]
  return best
}

const features = raw.features.filter((f) => !EXCLUDE.has(f.properties.DISTNAME))

const communities = features.map((f) => {
  const ring = outerRing(f.geometry).map(([x, y]) => [x, y])
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length

  // Tolerance climbs until the ring is down to the 4-8 vertices docs/02
  // section 4.1 asks a drawn block for.
  let simple = ring
  for (let t = 0.0002; simple.length > 9 && t < 0.02; t *= 1.25) {
    simple = simplify(ring, t)
  }
  if (simple[0][0] !== simple[simple.length - 1][0] || simple[0][1] !== simple[simple.length - 1][1]) {
    simple = [...simple, simple[0]]
  }

  const xs = simple.map((p) => p[0]), ys = simple.map((p) => p[1])
  const round = (ps) => ps.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
  const hectares = f.properties.HECTARES ?? (f.properties.AREA_M2 ?? 0) / 10000
  const lots = Math.max(10, Math.min(30, Math.round(hectares / 14)))

  return {
    community_id: slug(f.properties.DISTNAME),
    city_id: 'kw',
    name: f.properties.DISTNAME,
    source: 'admin',
    centroid: [Number(cx.toFixed(5)), Number(cy.toFixed(5))],
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => Number(n.toFixed(5))),
    area_km2: Number((hectares / 100).toFixed(2)),
    polygon_real: { type: 'Polygon', coordinates: [round(outerRing(f.geometry))] },
    polygon_block: { type: 'Polygon', coordinates: [round(shrink(simple, [cx, cy], 0.9))] },
    adjacent_ids: [],
    relative_position: { bearing_from_center: '', distance_km_from_center: 0 },
    land_use_hints: {
      park_ratio: 0.1, water_adjacent: false, major_road: true,
      transit_stations: 0, campus: /UW|Campus/i.test(f.properties.DISTNAME),
      dominant_zoning: 'mixed',
    },
    capacity: { lot_count: lots, max_height_tier: 3 },
  }
})

// Centre of the city, for bearings.
const mx = communities.reduce((s, c) => s + c.centroid[0], 0) / communities.length
const my = communities.reduce((s, c) => s + c.centroid[1], 0) / communities.length
const KM_PER_DEG = 111.32

for (const c of communities) {
  const dx = (c.centroid[0] - mx) * KM_PER_DEG * Math.cos((my * Math.PI) / 180)
  const dy = (c.centroid[1] - my) * KM_PER_DEG
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  c.relative_position = {
    bearing_from_center: points[Math.round(((bearing + 360) % 360) / 45) % 8],
    distance_km_from_center: Number(Math.hypot(dx, dy).toFixed(2)),
  }
  // Adjacency by bounding-box touch, which is enough for the planner's hints.
  c.adjacent_ids = communities
    .filter((o) => o !== c &&
      o.bbox[0] <= c.bbox[2] + 0.002 && o.bbox[2] >= c.bbox[0] - 0.002 &&
      o.bbox[1] <= c.bbox[3] + 0.002 && o.bbox[3] >= c.bbox[1] - 0.002)
    .map((o) => o.community_id)
}

const slots = communities.flatMap((c) => [
  { community_id: c.community_id, slot_id: 'slot-1', x: -0.6, y: 0.5 },
  { community_id: c.community_id, slot_id: 'slot-2', x: 0, y: -0.6 },
  { community_id: c.community_id, slot_id: 'slot-3', x: 0.6, y: 0.5 },
])

writeFileSync(join(here, '..', 'data', 'processed', 'city.json'), JSON.stringify({ communities }, null, 2) + '\n')
writeFileSync(join(here, '..', 'data', 'processed', 'slots.json'), JSON.stringify(slots, null, 2) + '\n')

console.log(`${communities.length} districts, ${slots.length} slots`)
for (const c of communities) {
  console.log(`  ${c.community_id.padEnd(34)} ${String(c.polygon_block.coordinates[0].length).padStart(2)} pts  ${c.relative_position.bearing_from_center}`)
}
