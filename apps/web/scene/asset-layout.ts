import { inside, type Cell } from '@living-city/modeling'

export function buildingAsset(cell: Cell, campus = false) {
  const v = Math.min(0.999999, Math.max(0, cell.variant))
  switch (cell.category) {
    case 'office': return `office-0${1 + Math.floor(v * 2)}`
    case 'retail': return 'shop-01'
    case 'cafe_bar': return 'cafe-01'
    case 'cultural_civic': return 'civic-01'
    case 'campus_industrial': return campus ? 'campus-01' : 'warehouse-01'
    default: return (cell.storeys ?? 1) > 3 ? `apartment-0${1 + Math.floor(v * 2)}` : `house-0${1 + Math.floor(v * 3)}`
  }
}

export const decorationAsset: Record<string, string> = {
  benches: 'bench', flower_planters: 'planter', planters: 'planter', string_lights: 'string-lights', lanterns: 'string-lights',
  food_trucks: 'food-truck', fountain: 'fountain', fountain_plaza: 'fountain', sculpture: 'sculpture', sculptures: 'sculpture',
  stage: 'stage', market_stalls: 'market-stall', kiosks: 'market-stall', outdoor_seating: 'table-01', banners: 'street-sign-01',
}

/** Reserve an existing lot, wholly inside terrain and clear of saved decoration slots. */
export function waterCell(cells: Cell[], ring: Array<[number, number]>, eligible: boolean, slots: Array<[number, number]>): number {
  if (!eligible) return -1
  return cells.findIndex((cell) => {
    if (cell.kind === 'plaza') return false
    const radius = cell.size * 0.48
    if (slots.some(([x, y]) => Math.abs(x - cell.x) < radius + cell.size * 0.3 && Math.abs(y - cell.y) < radius + cell.size * 0.3)) return false
    return Array.from({ length: 24 }, (_, i) => i * Math.PI / 12).every((a) => inside(cell.x + Math.cos(a) * radius, cell.y + Math.sin(a) * radius, ring))
  })
}

export function vegetationAsset(types: readonly string[], variant: number) {
  const type = types[Math.min(types.length - 1, Math.floor(variant * types.length))]
  switch (type) {
    case 'flower_beds': case 'wild_meadow': return 'flowers-01'
    case 'hedges': case 'park_lawn': case 'rooftop_green': return 'shrub-01'
    case 'planters': return 'planter'
    case 'mature_trees': return 'tree-02'
    case 'street_trees': return 'tree-01'
    default: return variant < 0.5 ? 'tree-01' : 'tree-02'
  }
}

/** Four readable props per plaza, rather than losing everything after the first tag. */
export function plazaDecorations(tags: readonly string[]) {
  return tags.slice(0, 4).map((tag, index, all) => ({
    tag,
    x: all.length === 1 ? 0 : (index % 2 === 0 ? -0.24 : 0.24),
    z: all.length <= 2 ? 0 : (index < 2 ? -0.24 : 0.24),
  }))
}
