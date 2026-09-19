import { existsSync, readFileSync } from 'node:fs'
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

type ManifestAsset = {
  kind: string
  category?: string
  draco?: boolean
  file?: string
  license?: string
  target?: string
}

const readGlbJson = (file: string) => {
  const glb = readFileSync(new URL(`../${file}`, import.meta.url))
  expect(glb.subarray(0, 4).toString('utf8')).toBe('glTF')
  const jsonLength = glb.readUInt32LE(12)
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) as {
    extensionsRequired?: string[]
    extensionsUsed?: string[]
  }
}

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

  it('ships a CC0 Draco pack within the documented breadth caps', () => {
    const manifest = readData('asset-manifest.v1.json')
    const assets = manifest.assets as Record<string, ManifestAsset>
    const mappings = manifest.enum_mappings as Record<string, Record<string, string>>
    const glbAssets = Object.values(assets).filter((asset) => asset.kind === 'glb')

    expect(glbAssets.filter((asset) => asset.category === 'building')).toHaveLength(8)
    expect(glbAssets.filter((asset) => asset.category === 'decoration' || asset.category === 'vegetation')).toHaveLength(12)
    expect(glbAssets.filter((asset) => asset.category === 'people')).toHaveLength(2)
    expect(Object.entries(assets).filter(([id, asset]) => id.startsWith('palette.') && asset.kind === 'material')).toHaveLength(4)
    expect(Object.keys(assets).filter((id) => id.startsWith('effect.'))).toHaveLength(3)
    expect(new Set(Object.values(mappings.archetype)).size).toBe(5)

    for (const [id, asset] of Object.entries(assets)) {
      if (asset.kind !== 'alias') continue
      expect(asset.target, `${id} needs an alias target`).toBeTruthy()
      expect(assets).toHaveProperty(asset.target as string)
    }

    for (const asset of glbAssets) {
      expect(asset.file).toBeTruthy()
      expect(existsSync(new URL(`../${asset.file}`, import.meta.url))).toBe(true)
      expect(asset.license).toBe('CC0-1.0')
      expect(asset.draco).toBe(true)
      const glb = readGlbJson(asset.file as string)
      expect(glb.extensionsUsed).toContain('KHR_draco_mesh_compression')
      expect(glb.extensionsRequired).toContain('KHR_draco_mesh_compression')
    }

    const sources = readFileSync(new URL('../assets/kenney/ASSET-SOURCES.md', import.meta.url), 'utf8')
    const license = readFileSync(new URL('../assets/kenney/LICENSE-KENNEY-CC0.txt', import.meta.url), 'utf8')
    expect(sources).toContain('Kenney')
    expect(license).toContain('CC0-1.0')
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
