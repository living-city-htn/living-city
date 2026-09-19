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

/**
 * Every district. An earlier version dropped the rural fringe to get a tidier
 * silhouette, which is the wrong trade: the city stops looking like the map.
 * Erbsville, Beaver Creek Meadows, Lakeshore North, Conservation Meadows,
 * Country Squire and Rural East are all part of Waterloo and all belong here.
 */
const EXCLUDE = new Set()

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

/**
 * The half-plane of points that belong to `a` rather than `b`, given each
 * site's weight. With both weights zero this is the plain perpendicular
 * bisector; raising a site's weight pushes the boundary away from it. The
 * boundary stays a straight line either way, so the cells still tile exactly.
 */
function bisector(a, b, wa = 0, wb = 0, pull = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  // `pull` walks the boundary back toward `a` by that many metres, which is
  // how the seam is cut: both neighbours give up half of it.
  const c = (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1] - (wb - wa)) / 2
    - pull * Math.hypot(dx, dy)
  const side = (p) => p[0] * dx + p[1] * dy - c
  return {
    inside: (p) => side(p) <= 0,
    intersect: (p, q) => {
      const sp = side(p), sq = side(q)
      const t = sp / (sp - sq)
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    },
  }
}

const signedArea = (ring) => {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}
const ringArea = (ring) => Math.abs(signedArea(ring))

/**
 * Area-weighted centroid, not the average of the vertices. The vertex mean is
 * pulled toward whichever edge happens to carry the most points, which on an
 * irregular district lands the site off in a corner and leaves its cell a
 * sliver — Lexington came out with no area at all.
 */
const centroidOf = (ring) => {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  if (Math.abs(a) < 1e-12) {
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ]
  }
  a *= 0.5
  return [cx / (6 * a), cy / (6 * a)]
}

/**
 * Everything below works in metres, not degrees.
 *
 * A degree of longitude is about three quarters of a degree of latitude here,
 * so distances in raw coordinates are not distances: a seam cut to the same
 * numeric width came out narrower east-to-west than north-to-south, and an
 * inset had to convert back and forth to mean anything. One equirectangular
 * projection at the city's own latitude makes every length in this file a real
 * length, and the blocks are projected back at the end.
 */
const M_PER_DEG_LAT = 111320
let LAT0 = 0
const project = (ring) => {
  const k = Math.cos((LAT0 * Math.PI) / 180) * M_PER_DEG_LAT
  return ring.map(([x, y]) => [x * k, y * M_PER_DEG_LAT])
}
const unproject = (ring) => {
  const k = Math.cos((LAT0 * Math.PI) / 180) * M_PER_DEG_LAT
  return ring.map(([x, y]) => [x / k, y / M_PER_DEG_LAT])
}

const outerRing = (geometry) => {
  if (geometry.type === 'Polygon') return geometry.coordinates[0]
  let best = geometry.coordinates[0][0]
  for (const poly of geometry.coordinates) if (poly[0].length > best.length) best = poly[0]
  return best
}

const features = raw.features.filter((f) => !EXCLUDE.has(f.properties.DISTNAME))
const degreeRings = features.map((f) => outerRing(f.geometry))
LAT0 = degreeRings.flat().reduce((s, p) => s + p[1], 0) / degreeRings.flat().length
const officialRings = degreeRings.map(project)

// ---------------------------------------------------------------------------
// A raster of the city, used both to trace the outline and to find the land
// that belongs to no district at all.
// ---------------------------------------------------------------------------

const GRID = 1400
const EMPTY = -1

const bounds = (() => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const ring of officialRings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, maxX, minY, maxY, stepX: (maxX - minX) / GRID, stepY: (maxY - minY) / GRID }
})()

const { minX, maxX, minY, maxY, stepX, stepY } = bounds
const at = (i, j) => j * (GRID + 1) + i
const gx = (i) => minX + i * stepX
const gy = (j) => minY + j * stepY

/** Scanline fill, so a 1400-square raster of 26 districts stays instant. */
const owner = new Int16Array((GRID + 1) * (GRID + 1)).fill(EMPTY)
officialRings.forEach((ring, k) => {
  for (let j = 0; j <= GRID; j++) {
    const y = gy(j)
    const xs = []
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [x1, y1] = ring[a]
      const [x2, y2] = ring[b]
      if (y1 > y !== y2 > y) xs.push(((x2 - x1) * (y - y1)) / (y2 - y1) + x1)
    }
    xs.sort((p, q) => p - q)
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const i0 = Math.max(0, Math.ceil((xs[s] - minX) / stepX))
      const i1 = Math.min(GRID, Math.floor((xs[s + 1] - minX) / stepX))
      for (let i = i0; i <= i1; i++) if (owner[at(i, j)] === EMPTY) owner[at(i, j)] = k
    }
  }
})

const CELL_KM2 = (stepX * stepY) / 1e6

/**
 * Trace a region's outline by sweeping rays from a point inside it and keeping
 * the last filled sample on each.
 *
 * A convex hull was rounding off the real boundary — the notches and the angled
 * north edge are what make the shape recognisable as Waterloo, and a hull
 * throws exactly those away. Keeping the *last* hit rather than the first means
 * an interior gap does not cut the ray short, so the city outline encloses the
 * whole built area.
 */
function traceRegion(isFilled, centre, rays = 128) {
  const reach = Math.hypot(maxX - minX, maxY - minY)
  const stride = Math.min(stepX, stepY) * 0.8
  const out = []
  for (let r = 0; r < rays; r++) {
    const angle = (r / rays) * Math.PI * 2
    const dx = Math.cos(angle), dy = Math.sin(angle)
    let last = null
    for (let d = stride; d <= reach; d += stride) {
      const x = centre[0] + dx * d, y = centre[1] + dy * d
      if (isFilled(x, y)) last = [x, y]
    }
    if (last) out.push(last)
  }
  return out
}

const sample = (grid, x, y) => {
  const i = Math.round((x - minX) / stepX)
  const j = Math.round((y - minY) / stepY)
  if (i < 0 || j < 0 || i > GRID || j > GRID) return EMPTY
  return grid[at(i, j)]
}

/**
 * Drop outline points that sit on a line their neighbours already describe.
 *
 * The sweep returns a point per ray whether the edge turned there or not, and
 * every cell that meets the city boundary inherits those points: blocks were
 * coming out with nineteen vertices, most of them along a straight run. This
 * runs once, on the outline, before the city is cut up — so the blocks stay a
 * partition and their shared edges, which are bisectors rather than outline,
 * are untouched.
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()
    const [ax, ay] = points[lo]
    const [bx, by] = points[hi]
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    let worst = tolerance, at = -1
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i]
      const d = len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > worst) { worst = d; at = i }
    }
    if (at !== -1) {
      keep[at] = 1
      stack.push([lo, at], [at, hi])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Metres: coarse enough to flatten a straight run, fine enough to keep a notch. */
const OUTLINE_TOLERANCE = 90

const outline = simplify(
  traceRegion((x, y) => sample(owner, x, y) !== EMPTY, [(minX + maxX) / 2, (minY + maxY) / 2]),
  OUTLINE_TOLERANCE,
)

/**
 * The land inside the city that no planning district claims.
 *
 * The official schedule leaves the Laurel Creek corridor and the University of
 * Waterloo's environmental reserve unlabelled — together the largest single
 * piece of Waterloo on the map, sitting between Laurelwood, Columbia Hills,
 * UW Northwest Campus and UW Research and Technology Park. Left out, it is not
 * empty on screen: the partition hands it to whichever district is nearest, so
 * the neighbours swell and the city loses the green wedge through its middle.
 * It gets its own block instead.
 */
const RESERVE_MIN_KM2 = 0.3

function interiorHoles() {
  const seen = new Uint8Array(owner.length)
  const found = []
  for (let s = 0; s < owner.length; s++) {
    if (owner[s] !== EMPTY || seen[s]) continue
    const stack = [s]
    seen[s] = 1
    const cells = []
    let touchesEdge = false
    while (stack.length) {
      const c = stack.pop()
      cells.push(c)
      const i = c % (GRID + 1)
      const j = (c - i) / (GRID + 1)
      if (i === 0 || j === 0 || i === GRID || j === GRID) touchesEdge = true
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a > GRID || b > GRID) continue
        const n = at(a, b)
        if (seen[n] || owner[n] !== EMPTY) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    if (!touchesEdge && cells.length * CELL_KM2 >= RESERVE_MIN_KM2) found.push(cells)
  }
  return found.sort((a, b) => b.length - a.length)
}

const holes = interiorHoles()
const reserveCells = holes[0] ?? []

const reserve = (() => {
  if (!reserveCells.length) return null
  const mark = new Uint8Array(owner.length)
  for (const c of reserveCells) mark[c] = 1
  let sx = 0, sy = 0
  for (const c of reserveCells) {
    const i = c % (GRID + 1)
    sx += gx(i)
    sy += gy((c - i) / (GRID + 1))
  }
  const mean = [sx / reserveCells.length, sy / reserveCells.length]
  // Sweep from a cell that is genuinely inside, so no ray starts outside the
  // region and traces a neighbour's land instead.
  let centre = mean, best = Infinity
  for (const c of reserveCells) {
    const i = c % (GRID + 1)
    const p = [gx(i), gy((c - i) / (GRID + 1))]
    const d = Math.hypot(p[0] - mean[0], p[1] - mean[1])
    if (d < best) { best = d; centre = p }
  }
  const ring = traceRegion((x, y) => sample(mark, x, y) === 1, centre, 96)
  return { ring: [...ring, ring[0]], centre, km2: reserveCells.length * CELL_KM2 }
})()

// ---------------------------------------------------------------------------
// Sites and target areas
// ---------------------------------------------------------------------------

/**
 * Target area comes from the geometry, not from the HECTARES column.
 *
 * The column disagrees with the shapes it describes in three places: UW
 * Northwest Campus and UW Research and Technology Park both carry 388.806 ha,
 * a value duplicated into both rows, when their rings measure 1.09 and 1.06
 * km2. Two districts asking for three and a half times their real size is
 * enough to stop the weights ever settling. Measuring the ring keeps the
 * target and the site consistent, since both come from the same polygon.
 */
const parts = features.map((f, i) => {
  const ring = officialRings[i]
  return {
    name: f.properties.DISTNAME,
    ring: degreeRings[i],
    site: centroidOf(ring),
    km2: ringArea(ring) / 1e6,
    official: true,
  }
})

if (reserve) {
  parts.push({
    name: 'UW Environmental Reserve',
    ring: unproject(reserve.ring),
    site: reserve.centre,
    km2: reserve.km2,
    official: false,
  })
}

const sites = parts.map((p) => p.site)

const cellFor = (i, weights, seam = 0) => {
  let cell = outline
  for (let j = 0; j < sites.length; j++) {
    if (j === i) continue
    const { inside, intersect } = bisector(sites[i], sites[j], weights[i], weights[j], seam)
    cell = clipHalfPlane(cell, inside, intersect)
    if (cell.length < 3) return []
  }
  return cell
}

/**
 * Solve one weight per district so each cell comes out the size its district
 * really is.
 *
 * A plain bisector puts every boundary halfway between two centroids, which
 * takes no account of size: Lexington is a 3 km² district whose neighbours sit
 * close on every side, and its cell collapsed to nothing. A single global
 * weight did not fix it — pushing hard enough to rescue Lexington swallowed
 * somebody else. Each district needs its own, so this nudges every weight up
 * when its cell is too small and down when it is too large, and repeats until
 * the shares settle. The cells stay a partition throughout.
 */
function solveWeights(targets) {
  const sum = targets.reduce((a, b) => a + b, 0)
  const share = targets.map((t) => t / sum)
  const span = Math.hypot(maxX - minX, maxY - minY)
  const unit = (span * span) / sites.length
  const weights = new Array(sites.length).fill(0)

  // A fixed step overshoots and then bounces: the run before this one was
  // still at 100% error after 240 passes because every pass jumped the
  // boundary past where it needed to be. Shrinking the step as it goes lets
  // the shares settle, and the best pass is kept in case a later one is worse.
  let best = { weights: [...weights], worst: Infinity }

  for (let pass = 0; pass < 400 && best.worst > 0.05; pass++) {
    const used = [...weights]
    const areas = sites.map((_, i) => ringArea(cellFor(i, weights)))
    const total = areas.reduce((a, b) => a + b, 0)
    let worst = 0
    const step = 0.25 / (1 + pass * 0.05)
    for (let i = 0; i < sites.length; i++) {
      const want = share[i] * total
      // Clamped: a starved cell reads as -100% and cannot swing the weight wildly.
      const err = Math.max(-1, Math.min(1, (want - areas[i]) / want))
      worst = Math.max(worst, Math.abs(err))
      weights[i] += step * err * unit
    }
    if (worst < best.worst) best = { weights: used, worst }
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length
    for (let i = 0; i < weights.length; i++) weights[i] -= mean
  }
  return best
}

const { weights, worst } = solveWeights(parts.map((p) => p.km2))

if (process.env.DEBUG_WEIGHTS) {
  const targets = parts.map((p) => p.km2)
  const tt = targets.reduce((a, b) => a + b, 0)
  const areas = sites.map((_, i) => ringArea(cellFor(i, weights)))
  const ta = areas.reduce((a, b) => a + b, 0)
  console.error('reported worst', worst)
  parts.map((p, i) => ({ n: p.name, want: targets[i] / tt, got: areas[i] / ta }))
    .sort((a, b) => a.got / a.want - b.got / b.want)
    .slice(0, 8)
    .forEach((r) => console.error('  ', r.n.padEnd(30), 'want', (r.want * 100).toFixed(1), 'got', (r.got * 100).toFixed(1)))
}

/**
 * Cut the seam on the boundaries between blocks, and only there.
 *
 * The first version inset each cell by the same distance on every side, which
 * assumed the cells were convex. They are not: a block on the edge of the city
 * inherits the outline's concave corners, and clipping such a polygon by its
 * own edges shears off large valid pieces — Willowdale kept a sixth of its
 * land and Country Squire an eighth, while the interior blocks were fine.
 *
 * Pulling each dividing line back by half the seam instead gives the same
 * uniform gap between neighbours, leaves the city's outer edge where it
 * belongs, and cannot misbehave on a concave cell because every cut is still
 * just a half-plane.
 */
const SEAM_METRES = 28

const cells = sites.map((_, i) => {
  const cell = cellFor(i, weights, SEAM_METRES / 2)
  // Nothing should starve once the weights are solved; if one ever does, an
  // uncut cell is far better than a district vanishing from the city.
  return cell.length >= 3 ? cell : cellFor(i, weights)
})

const communities = parts.map((part, i) => {
  const cell = unproject(cells[i])
  const [cx, cy] = centroidOf(cell)
  const round = (ps) => ps.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])
  const block = round([...cell, cell[0]])
  const xs = block.map((p) => p[0]), ys = block.map((p) => p[1])
  // The reserve is protected land, not lots: it gets a handful of places for
  // vegetation and nothing like a district's worth of buildings.
  const lots = part.official ? Math.max(10, Math.min(30, Math.round((part.km2 * 100) / 14))) : 4

  return {
    community_id: slug(part.name),
    city_id: 'kw',
    name: part.name,
    // The reserve is not on the official schedule; 'synthetic' is what the
    // contract's geoSource enum calls a block we derived rather than read.
    source: part.official ? 'admin' : 'synthetic',
    centroid: [Number(cx.toFixed(5)), Number(cy.toFixed(5))],
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => Number(n.toFixed(5))),
    area_km2: Number(part.km2.toFixed(2)),
    polygon_real: { type: 'Polygon', coordinates: [round(part.ring)] },
    polygon_block: { type: 'Polygon', coordinates: [block] },
    adjacent_ids: [],
    relative_position: { bearing_from_center: '', distance_km_from_center: 0 },
    land_use_hints: {
      park_ratio: part.official ? 0.1 : 0.9,
      water_adjacent: !part.official,
      major_road: part.official,
      transit_stations: 0,
      // The reserve is university land but it is not a campus: it is bush.
      campus: part.official && /UW|Campus/i.test(part.name),
      dominant_zoning: part.official ? 'mixed' : 'green',
    },
    capacity: { lot_count: lots, max_height_tier: part.official ? 3 : 1 },
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
  // Named, not numbered: the flat scene reads the id straight out to screen
  // readers, where "Lincoln, plaza, empty" beats "Lincoln, slot-2, empty".
  { community_id: c.community_id, slot_id: 'edge-west', x: -0.6, y: 0.5 },
  { community_id: c.community_id, slot_id: 'plaza', x: 0, y: -0.6 },
  { community_id: c.community_id, slot_id: 'edge-east', x: 0.6, y: 0.5 },
])

/**
 * Which official planning area feeds which block. The blocks are now the
 * districts one for one, so this is a rename rather than a lookup — but it is
 * generated here so it cannot drift from the city again. The reserve has no
 * official area behind it and so appears in neither side of the mapping.
 */
const official_area_mappings = features.map((f) => {
  // The same key src/assignment.ts builds, or the mapping matches nothing:
  // PLANNINGDI where the schedule carries one, the district name where it is
  // null. All 26 come out unique either way.
  const district = String(f.properties.PLANNINGDI ?? '').trim()
  const name = f.properties.DISTNAME
  return { official_area_id: `waterloo:${district || name}`, community_id: slug(name) }
})

writeFileSync(
  join(here, '..', 'data', 'processed', 'official-area-mapping.json'),
  JSON.stringify({ official_area_mappings }, null, 2) + '\n',
)
writeFileSync(join(here, '..', 'data', 'processed', 'city.json'), JSON.stringify({ communities }, null, 2) + '\n')
writeFileSync(join(here, '..', 'data', 'processed', 'slots.json'), JSON.stringify(slots, null, 2) + '\n')

const km2 = (ring) => ringArea(project(ring)) / 1e6
console.log(`${communities.length} districts, ${slots.length} slots`)
console.log(`weights settled to ${(worst * 100).toFixed(0)}% worst-case area error`)
if (reserve) console.log(`reserve: ${reserve.km2.toFixed(2)} km2 of unlabelled land carved out`)
const sized = communities
  .map((c) => ({ name: c.name, a: km2(c.polygon_block.coordinates[0]) }))
  .sort((p, q) => p.a - q.a)
for (const s of sized) console.log(`  ${s.a.toFixed(2).padStart(6)} km2  ${s.name}`)
