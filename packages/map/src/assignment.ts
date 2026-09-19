/**
 * Assignment uses official polygons only. Drawn blocks appear here solely as
 * the guaranteed-visible fallback when an official area has no mapped block
 * or a post falls outside the official data.
 */
export type Position = readonly [lon: number, lat: number]

export type Polygon = {
  type: 'Polygon'
  coordinates: readonly (readonly Position[])[]
}

export type OfficialArea = {
  official_area_id: string
  block_id: string | null
  polygon: Polygon
}

export type DrawnBlock = {
  community_id: string
  centroid: Position
}

export type AssignmentData = {
  officialAreas: readonly OfficialArea[]
  blocks: readonly DrawnBlock[]
}

const isOnSegment = (point: Position, start: Position, end: Position) => {
  const [x, y] = point
  const [x1, y1] = start
  const [x2, y2] = end
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
  if (Math.abs(cross) > Number.EPSILON) return false

  const withinX = x >= Math.min(x1, x2) && x <= Math.max(x1, x2)
  const withinY = y >= Math.min(y1, y2) && y <= Math.max(y1, y2)
  return withinX && withinY
}

const isInRing = (point: Position, ring: readonly Position[]) => {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]
    if (!current || !prior) continue
    if (isOnSegment(point, prior, current)) return true

    const [x, y] = point
    const [x1, y1] = current
    const [x2, y2] = prior
    const intersects = (y1 > y) !== (y2 > y)
      && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1
    if (intersects) inside = !inside
  }
  return inside
}

const contains = (point: Position, polygon: Polygon) => {
  const [outer, ...holes] = polygon.coordinates
  if (!outer || !isInRing(point, outer)) return false
  return !holes.some((hole) => isInRing(point, hole))
}

const nearestBlock = (point: Position, blocks: readonly DrawnBlock[]) => {
  let closest: DrawnBlock | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const block of blocks) {
    const [lon, lat] = block.centroid
    const candidate = (point[0] - lon) ** 2 + (point[1] - lat) ** 2
    if (candidate < distance) {
      closest = block
      distance = candidate
    }
  }
  return closest?.community_id ?? null
}

/**
 * Resolves a post to its drawn community id. A valid block set guarantees a
 * visible result even when official source data is incomplete.
 */
export const assignCommunity = (lon: number, lat: number, data: AssignmentData): string | null => {
  const point: Position = [lon, lat]
  const area = data.officialAreas.find((candidate) => contains(point, candidate.polygon))
  return area?.block_id ?? nearestBlock(point, data.blocks)
}
