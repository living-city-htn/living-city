import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ARCHETYPE,
  BEHAVIOR,
  DECORATION,
  EFFECT,
  HERO_ASSET,
  IDENTITY_TAG,
  LIGHTING_ACCENT,
  MOOD,
  PALETTE,
  VEGETATION_TYPE,
  assetTaxonomy,
  communityPlan,
} from '@living-city/contracts'

const readData = (file: string) =>
  JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8')) as Record<string, unknown>

const expectedEnums: Record<string, readonly string[]> = {
  archetype: ARCHETYPE,
  mood: MOOD,
  palette: PALETTE,
  identity_tags: IDENTITY_TAG,
  vegetation_types: VEGETATION_TYPE,
  behaviors: BEHAVIOR,
  decorations: DECORATION,
  lighting_accents: LIGHTING_ACCENT,
  effects: EFFECT,
  hero_asset: HERO_ASSET,
}

describe('3D Gate 0 assets', () => {
  it('maps every visual taxonomy value to an approved primitive asset or alias', () => {
    const manifest = readData('asset-manifest.v1.json')
    const taxonomy = assetTaxonomy.parse(readData('taxonomy.v1.json'))
    const mappings = manifest.enum_mappings as Record<string, Record<string, string>>
    const assetIds = new Set(Object.keys(manifest.assets as Record<string, unknown>))

    expect(taxonomy.version).toBe(manifest.version)
    for (const [name, values] of Object.entries(expectedEnums)) {
      expect(taxonomy.enums[name]).toEqual([...values])
      expect(Object.keys(mappings[name] ?? {}).sort()).toEqual([...values].sort())
      expect(Object.values(mappings[name] ?? {}).every((assetId) => assetIds.has(assetId))).toBe(true)
    }

    const shopItems = manifest.shop_items as Array<{ item_tag: string; price: number }>
    expect(shopItems).toHaveLength(6)
    expect(new Set(shopItems.map((item) => item.item_tag)).size).toBe(6)
    expect(Math.min(...shopItems.map((item) => item.price))).toBeLessThanOrEqual(20)
  })

  it('ships five distinct valid plans plus the loud festival plan', () => {
    const plans = readData('plans.mock.json') as {
      taxonomy_version: string
      plans: unknown[]
      preset_festival: unknown
    }

    expect(plans.plans).toHaveLength(5)
    const validated = plans.plans.map((plan) => communityPlan.parse(plan))
    expect(new Set(validated.map((plan) => plan.archetype)).size).toBe(5)
    expect(validated.every((plan) => plan.taxonomy_version === plans.taxonomy_version)).toBe(true)

    const festival = communityPlan.parse(plans.preset_festival)
    expect(festival.taxonomy_version).toBe(plans.taxonomy_version)
    expect(festival.mood).toBe('festive')
    expect(festival.effects).toContain('music_notes')
  })
})
