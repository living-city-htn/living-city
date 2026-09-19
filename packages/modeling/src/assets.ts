import generated from './assets.generated.json'

export type CityAsset = {
  id: string
  label: string
  url: string
  category: 'building' | 'nature' | 'furniture' | 'street' | 'decoration' | 'event'
  /** X width and Z depth; longest horizontal edge is one scene unit. */
  footprint: readonly [number, number]
  /** Ground pivot at Y=0. X/Z are centered, +Y up, front faces +Z. */
  height: number
  bytes: number
  triangles: number
  sha256: string
  source: { name: string; url: string; file: string; downloadUrl?: string; sha256?: string; license: 'CC0-1.0' | 'original' }
  /** Vertex palette supports a uniform material tint; never replace with a texture. */
  paletteSlots: readonly string[]
}

export const CITY_ASSETS = generated as unknown as readonly CityAsset[]
const byId = new Map(CITY_ASSETS.map(asset => [asset.id, asset]))
export const getCityAsset = (id: string): CityAsset | undefined => byId.get(id)

/** Existing contracts stay unchanged. Explicit aliases avoid missing taxonomy assets. */
export const ASSET_ALIASES: Readonly<Record<string, string>> = {
  benches: 'bench', planters: 'planter', string_lights: 'string-lights', food_trucks: 'food-truck',
  fountain: 'fountain', sculpture: 'sculpture', stage: 'stage', market_stalls: 'market-stall',
  street_trees: 'tree-01', mature_trees: 'tree-02', park_lawn: 'shrub-01', flower_beds: 'flowers-01',
  hedges: 'shrub-01', wild_meadow: 'flowers-01', rooftop_green: 'shrub-01',
  outdoor_seating: 'table-01', bike_racks: 'street-sign-01', bus_shelter: 'market-stall',
  kiosks: 'market-stall', banners: 'street-sign-01', flags: 'street-sign-01',
  mural: 'sculpture', graffiti: 'sculpture', neon_signs: 'street-sign-01',
  playground: 'bench', sports_court: 'bench', construction_barriers: 'street-sign-01',
  lanterns: 'string-lights', streetlamps_warm: 'traffic-light-01', streetlamps_cool: 'traffic-light-01',
  window_glow: 'office-01', neon: 'street-sign-01', spotlights: 'stage',
  clock_tower: 'campus-01', stadium: 'civic-01', ferris_wheel: 'sculpture', museum: 'civic-01',
  market_hall: 'shop-01', concert_hall: 'civic-01', giant_tree: 'tree-02', fountain_plaza: 'fountain',
  lighthouse: 'campus-01', university_hall: 'campus-01', transit_station: 'civic-01', observation_deck: 'office-02',
}

export const BUILDING_ASSETS: Readonly<Record<string, readonly string[]>> = {
  residential: ['house-01', 'house-02', 'house-03', 'apartment-01', 'apartment-02'],
  retail: ['shop-01', 'cafe-01'], cafe_bar: ['cafe-01', 'shop-01'],
  office: ['office-01', 'office-02'], cultural_civic: ['civic-01', 'campus-01'],
  campus_industrial: ['campus-01', 'warehouse-01'],
}

export function resolveAssetTag(tag: string): CityAsset | undefined {
  return getCityAsset(ASSET_ALIASES[tag] ?? tag)
}
