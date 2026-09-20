import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ARCHETYPE,
  BEHAVIOR,
  BUILDING_CATEGORIES,
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
import { ASSET_ALIASES, BUILDING_ASSETS, CITY_ASSETS, getCityAsset, resolveAssetTag } from '../src/assets'

const publicRoot = fileURLToPath(new URL('../../../apps/web/public', import.meta.url))

describe('curated asset library', () => {
  it('covers the approved building collection and all existing shop models without dangling aliases', () => {
    expect(CITY_ASSETS.filter(a => a.category === 'building')).toHaveLength(12)
    expect(new Set(CITY_ASSETS.map(a => a.id)).size).toBe(CITY_ASSETS.length)
    for (const category of BUILDING_CATEGORIES) {
      expect(BUILDING_ASSETS[category]?.length).toBeGreaterThan(0)
      for (const id of BUILDING_ASSETS[category]) expect(getCityAsset(id)?.category).toBe('building')
    }
    for (const tag of [...DECORATION, ...HERO_ASSET, ...LIGHTING_ACCENT, ...VEGETATION_TYPE]) {
      expect(ASSET_ALIASES[tag], tag).toBeTruthy()
      expect(resolveAssetTag(tag), tag).toBeDefined()
    }
    const shop = ['benches', 'planters', 'string_lights', 'food_trucks', 'fountain', 'sculpture']
    expect(new Set(shop.map(tag => resolveAssetTag(tag)?.id)).size).toBe(6)
    expect(resolveAssetTag('not-a-real-tag')).toBeUndefined()
  })

  it('ships a matching public manifest, explicit provenance and a small library', () => {
    expect(JSON.parse(readFileSync(`${publicRoot}/assets/city/manifest.json`, 'utf8'))).toEqual(CITY_ASSETS)
    expect(CITY_ASSETS.reduce((sum, a) => sum + a.bytes, 0)).toBeLessThan(1_500_000)
    for (const asset of CITY_ASSETS) {
      expect(asset.source.file).toBeTruthy()
      expect(asset.source.url).toMatch(/^https:\/\//)
      if (asset.source.license === 'CC0-1.0') {
        const pack = asset.source.url.split('/').at(-1)
        expect(readFileSync(`${publicRoot}/assets/city/licenses/${pack}.txt`, 'utf8')).toMatch(/CC0/)
      }
    }
  })

  for (const asset of CITY_ASSETS) it(`${asset.id}: valid standalone GLB, accurate grounded bounds and indexed geometry`, () => {
    const bytes = readFileSync(publicRoot + asset.url)
    expect(bytes.byteLength).toBe(asset.bytes)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256)
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67)
    expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length)
    const jsonLength = bytes.readUInt32LE(12)
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
    expect(gltf.images).toBeUndefined()
    expect(gltf.buffers).toHaveLength(1)
    expect(gltf.buffers[0].uri).toBeUndefined()
    expect(gltf.meshes).toHaveLength(1)
    expect(gltf.meshes[0].primitives).toHaveLength(1)
    const primitive = gltf.meshes[0].primitives[0]
    const binOffset = 28 + jsonLength
    const positions = gltf.accessors[primitive.attributes.POSITION]
    const view = gltf.bufferViews[positions.bufferView]
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < positions.count; i++) for (let axis = 0; axis < 3; axis++) {
      const value = bytes.readFloatLE(binOffset + (view.byteOffset ?? 0) + i * 12 + axis * 4)
      expect(Number.isFinite(value)).toBe(true)
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
    }
    expect(min[1]).toBeCloseTo(0, 5)
    expect(min[0] + max[0]).toBeCloseTo(0, 5)
    expect(min[2] + max[2]).toBeCloseTo(0, 5)
    expect(max[0] - min[0]).toBeCloseTo(asset.footprint[0], 5)
    expect(max[2] - min[2]).toBeCloseTo(asset.footprint[1], 5)
    expect(max[1]).toBeCloseTo(asset.height, 5)
    expect(Math.max(...asset.footprint)).toBeCloseTo(1, 5)
    const indices = gltf.accessors[primitive.indices]
    expect(indices.count).toBe(asset.triangles * 3)
    const indexView = gltf.bufferViews[indices.bufferView]
    for (let i = 0; i < indices.count; i++) {
      const offset = binOffset + (indexView.byteOffset ?? 0) + i * (indices.componentType === 5123 ? 2 : 4)
      const value = indices.componentType === 5123 ? bytes.readUInt16LE(offset) : bytes.readUInt32LE(offset)
      expect(value).toBeLessThan(positions.count)
    }
  })
})

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
