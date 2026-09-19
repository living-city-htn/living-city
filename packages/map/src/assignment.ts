import kitchenerAreas from '../data/raw/kitchener-planning-communities.json'
import waterlooAreas from '../data/raw/waterloo-district-plans.json'
import mappings from '../data/processed/official-area-mapping.json'
import { processedCity } from './city'

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

type RawFeature = {
  properties?: Record<string, unknown>
  geometry?: unknown
}

const areaMappings = new Map(
  mappings.official_area_mappings.map((mapping) => [mapping.official_area_id, mapping.community_id]),
)

const featuresOf = (collection: unknown): RawFeature[] => {
  if (!collection || typeof collection !== 'object') return []
  const features = (collection as { features?: unknown }).features
  return Array.isArray(features) ? features as RawFeature[] : []
}

const asPolygon = (geometry: unknown): Polygon | null => {
  if (!geometry || typeof geometry !== 'object') return null
  const candidate = geometry as { type?: unknown; coordinates?: unknown }
  if (candidate.type !== 'Polygon' || !Array.isArray(candidate.coordinates)) return null
  return candidate as Polygon
}

const stringProperty = (properties: Record<string, unknown> | undefined, name: string) => {
  const value = properties?.[name]
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

const areasFrom = (
  source: unknown,
  officialAreaId: (properties: Record<string, unknown> | undefined) => string,
): OfficialArea[] => featuresOf(source).flatMap((feature) => {
  const polygon = asPolygon(feature.geometry)
  const official_area_id = officialAreaId(feature.properties)
  if (!polygon || !official_area_id) return []
  return [{
    official_area_id,
    block_id: areaMappings.get(official_area_id) ?? null,
    polygon,
  }]
})

/**
 * The only place the checked-in raw sources are read. Their polygons remain
 * untouched; processed city geometry is used only for the guaranteed-visible
 * nearest-block fallback.
 */
export const defaultAssignmentData: AssignmentData = {
  officialAreas: [
    ...areasFrom(kitchenerAreas, (properties) => `kitchener:${stringProperty(properties, 'PLANNINGCOMMUNITYID')}`),
    ...areasFrom(waterlooAreas, (properties) => {
      const districtId = stringProperty(properties, 'PLANNINGDI')
      return `waterloo:${districtId || stringProperty(properties, 'DISTNAME')}`
    }),
  ],
  blocks: processedCity.communities.map((community) => ({
    community_id: community.community_id,
    centroid: [community.centroid[0]!, community.centroid[1]!],
  })),
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
export const assignCommunity = (
  lon: number,
  lat: number,
  data: AssignmentData = defaultAssignmentData,
): string | null => {
  const point: Position = [lon, lat]
  const area = data.officialAreas.find((candidate) => contains(point, candidate.polygon))
  return area?.block_id ?? nearestBlock(point, data.blocks)
}
