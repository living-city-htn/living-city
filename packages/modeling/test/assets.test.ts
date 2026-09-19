import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUILDING_CATEGORIES, DECORATION, HERO_ASSET, LIGHTING_ACCENT, VEGETATION_TYPE } from '@living-city/contracts'
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
