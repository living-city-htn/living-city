/**
 * Hand-written shapes for the fixtures.
 *
 * These are NOT the contract. `packages/contracts` (Pipeline-owned) is the seam
 * everything compiles against; these exist only so the fixtures and the stub API
 * are typed before it lands. When contracts ships, delete this file and import
 * from there instead.
 *
 * Shapes follow docs/02 section 7 and docs/03 sections 2.1 and 3.2.
 */

export type CommunityGeo = {
  community_id: string
  city_id: string
  name: string
  source: 'admin' | 'neighborhood' | 'synthetic'
  centroid: [number, number] | number[]
  bbox: number[]
  area_km2: number
  polygon_real: { type: string; coordinates: number[][][] }
  polygon_block: { type: string; coordinates: number[][][] }
  adjacent_ids: string[]
  relative_position: { bearing_from_center: string; distance_km_from_center: number }
  land_use_hints: {
    park_ratio: number
    water_adjacent: boolean
    major_road: boolean
    transit_stations: number
    campus: boolean
    dominant_zoning: string
  }
  capacity: { lot_count: number; max_height_tier: number }
}

export type DecorationSlot = {
  community_id: string
  slot_id: string
  x: number
  y: number
}

export type SeedUser = {
  id: string
  display_name: string
  role: 'resident' | 'government'
  balance: number
}

export type SeedPost = {
  id: string
  user_id: string
  text: string
  image_url: string | null
  lon: number
  lat: number
  created_at: string
  community_id: string
  is_incident_report: boolean
  status: 'pending' | 'analyzed'
  hidden: boolean
  hidden_reason: 'auto' | 'operator' | null
}

export type BuildingComposition = {
  residential: number
  retail: number
  cafe_bar: number
  office: number
  cultural_civic: number
  campus_industrial: number
}

export type CommunityPlan = {
  schema_version: string
  taxonomy_version: string
  community_id: string
  plan_id: string
  summary: string
  archetype: string
  identity_tags: string[]
  density: number
  height_profile: string
  building_composition: BuildingComposition
  vegetation: { level: number; types: string[] }
  activity: {
    pedestrian_density: number
    crowd_clusters: number
    vehicle_traffic: number
    behaviors: string[]
  }
  decorations: Array<{ tag: string; prominence: number }>
  mood: string
  palette: string
  lighting: {
    signature_time: string
    intensity: number
    color_temp: string
    accents: string[]
  }
  effects: string[]
  hero_asset: { tag: string; prominence: number } | null
  stability: {
    change_magnitude: 'none' | 'minor' | 'moderate' | 'major'
    retained_from_previous: string[]
    reasons: string[]
  }
  confidence: number
}

export type ShopItem = {
  item_tag: string
  price: number
  category: string
  label: string
}
