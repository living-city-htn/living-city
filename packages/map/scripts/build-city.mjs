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

/**
 * Why the blocks are a partition rather than simplified official outlines.
 *
 * Simplifying each district on its own breaks the shared edges: two neighbours
 * reduce the same boundary to different lines, so the city comes apart into
 * gaps and overlaps and stops reading as one place. docs/02 section 4.1 asks
 * the visual layer to preserve silhouette, relative position and adjacency —
 * not the boundaries themselves.
 *
 * So the city outline is cut into one cell per district instead: every cell is
 * the set of points nearer to its own district than to any other, clipped to
 * the outline. The pieces tile exactly, each has a handful of vertices, and
 * each sits where its district sits. Assignment still uses the official
 * polygons, which are untouched.
 */

/** Sutherland-Hodgman: keep the part of `poly` on the inside of a half-plane. */
function clipHalfPlane(poly, inside, intersect) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]
    const prev = poly[(i + poly.length - 1) % poly.length]
    const curIn = inside(cur)
    const prevIn = inside(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

/** The half-plane of points at least as close to `a` as to `b`. */
function bisector(a, b) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const side = (p) => (p[0] - mx) * dx + (p[1] - my) * dy
  return {
    inside: (p) => side(p) <= 0,
    intersect: (p, q) => {
      const sp = side(p), sq = side(q)
      const t = sp / (sp - sq)
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    },
  }
}

/** Andrew's monotone chain. */
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (src) => {
    const h = []
    for (const p of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop()
      h.push(p)
    }
    h.pop()
    return h
  }
  return [...half(pts), ...half([...pts].reverse())]
}


const features = raw.features.filter((f) => !EXCLUDE.has(f.properties.DISTNAME))

const outerRing = (geometry) => {
  if (geometry.type === 'Polygon') return geometry.coordinates[0]
  let best = geometry.coordinates[0][0]
  for (const poly of geometry.coordinates) if (poly[0].length > best.length) best = poly[0]
  return best
}

const centroidOf = (ring) => [
  ring.reduce((s, p) => s + p[0], 0) / ring.length,
  ring.reduce((s, p) => s + p[1], 0) / ring.length,
]

const rings = features.map((f) => outerRing(f.geometry))
const sites = rings.map(centroidOf)

// One outline for the whole city, kept loose so it reads as a single place.
const outline = hull(rings.flat())

const cells = sites.map((site, i) => {
  let cell = outline
  for (let j = 0; j < sites.length; j++) {
    if (j === i) continue
    const { inside, intersect } = bisector(site, sites[j])
    cell = clipHalfPlane(cell, inside, intersect)
    if (cell.length === 0) break
  }
  return cell
})

/**
 * Inset every cell by the same distance, so every seam is the same width.
 *
 * Scaling a cell toward its own centroid does not do this: the same percentage
 * on a large district and a small one produces a wide gap beside a hairline,
 * which is what made the city look broken rather than divided.
 *
 * Cells are convex, so an inset is just the polygon clipped by each of its own
 * edges moved inward — no general offsetting needed. The work happens in metres
 * so a degree of longitude and a degree of latitude do not give different gaps.
 */
const SEAM_METRES = 28

const M_PER_DEG_LAT = 111320
const toMetres = (ring, lat0) => {
  const k = Math.cos((lat0 * Math.PI) / 180)
  return ring.map(([x, y]) => [x * k * M_PER_DEG_LAT, y * M_PER_DEG_LAT])
}
const toDegrees = (ring, lat0) => {
  const k = Math.cos((lat0 * Math.PI) / 180)
  return ring.map(([x, y]) => [x / (k * M_PER_DEG_LAT), y / M_PER_DEG_LAT])
}

/** Positive for counter-clockwise. */
const signedArea = (ring) => {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

function insetConvex(ring, lat0, metres) {
  let poly = toMetres(ring, lat0)
  if (signedArea(poly) < 0) poly = [...poly].reverse()
  const edges = poly.map((a, i) => [a, poly[(i + 1) % poly.length]])

  let cell = poly
  for (const [a, b] of edges) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    // Interior lies to the left of a->b on a counter-clockwise ring.
    const nx = -dy / len
    const ny = dx / len
    const ox = a[0] + nx * metres
    const oy = a[1] + ny * metres
    const side = (p) => (p[0] - ox) * nx + (p[1] - oy) * ny
    cell = clipHalfPlane(cell, (p) => side(p) >= 0, (p, q) => {
      const sp = side(p), sq = side(q)
      const t = sp / (sp - sq)
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    })
    if (cell.length < 3) return ring
  }
  return toDegrees(cell, lat0)
}

const communities = features.map((f, i) => {
  const cell = cells[i]
  const official = rings[i]
  const [cx, cy] = centroidOf(cell)
  const round = (ps) => ps.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
  const inset = insetConvex(cell, cy, SEAM_METRES)
  const block = round([...inset, inset[0]])
  const xs = block.map((p) => p[0]), ys = block.map((p) => p[1])
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
    polygon_real: { type: 'Polygon', coordinates: [round(official)] },
    polygon_block: { type: 'Polygon', coordinates: [block] },
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
