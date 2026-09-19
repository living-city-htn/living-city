import { z } from 'zod'
import { bearing, dominantZoning, geoSource } from './enums'

/** docs/03 section 2.1. Polygons never go to the AI. */

export const lonLat = z.tuple([z.number(), z.number()])

export const polygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(lonLat)),
})

export const landUseHints = z.object({
  park_ratio: z.number().min(0).max(1),
  water_adjacent: z.boolean(),
  major_road: z.boolean(),
  transit_stations: z.number().int().min(0),
  campus: z.boolean(),
  dominant_zoning: dominantZoning,
})

export const capacity = z.object({
  lot_count: z.number().int().min(0),
  max_height_tier: z.number().int().min(1).max(5),
})

export const relativePosition = z.object({
  bearing_from_center: bearing,
  distance_km_from_center: z.number().min(0),
})

export const communityGeo = z.object({
  community_id: z.string().min(1),
  city_id: z.string().min(1),
  name: z.string().min(1),
  source: geoSource,
  centroid: lonLat,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  area_km2: z.number().min(0),
  polygon_real: polygon,
  polygon_block: polygon,
  adjacent_ids: z.array(z.string()),
  relative_position: relativePosition,
  land_use_hints: landUseHints,
  capacity,
})

/**
 * The subset forwarded to Call B. Everything else, polygons above all, stays out
 * of the prompt. docs/03 section 2.1: "the planning prompt receives the ->B
 * subset only".
 */
export const communityGeoForPlanning = communityGeo.pick({
  community_id: true, city_id: true, name: true, source: true, area_km2: true,
  adjacent_ids: true, relative_position: true, land_use_hints: true, capacity: true,
})

export const toPlanningGeo = (geo: CommunityGeo): CommunityGeoForPlanning =>
  communityGeoForPlanning.parse(geo)

/** A decoration slot. Derived from the block polygon, stable across replans. */
export const decorationSlot = z.object({
  community_id: z.string(),
  slot_id: z.string(),
  x: z.number(),
  y: z.number(),
})

export type CommunityGeo = z.infer<typeof communityGeo>
export type CommunityGeoForPlanning = z.infer<typeof communityGeoForPlanning>
export type DecorationSlot = z.infer<typeof decorationSlot>
