'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getCityAsset } from '@living-city/modeling'

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }
const cache = new Map<string, Promise<Part[]>>()

/** Shared for the lifetime of the app; mounted instances never dispose cached resources. */
function loadParts(url: string) {
  let pending = cache.get(url)
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url).then(({ scene }) => {
      scene.updateMatrixWorld(true)
      const parts: Part[] = []
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) parts.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() })
      })
      if (!parts.length) throw new Error(`Empty city asset: ${url}`)
      return parts
    })
    cache.set(url, pending)
  }
  return pending
}

export type AssetInstance = { position: [number, number, number]; scale: [number, number, number]; rotation?: number }

function PartInstances({ part, instances }: { part: Part; instances: AssetInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    // R3F reconstructs this mesh when args change. Its instance buffer belongs
    // to this batch; geometry/materials belong to the shared asset cache.
    return () => { mesh?.dispose() }
  }, [part, instances.length])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new THREE.Object3D()
    instances.forEach((instance, i) => {
      transform.position.fromArray(instance.position)
      transform.scale.fromArray(instance.scale)
      transform.rotation.set(0, instance.rotation ?? 0, 0)
      transform.updateMatrix()
      mesh.setMatrixAt(i, transform.matrix.clone().multiply(part.matrix))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [part, instances])
  return <instancedMesh ref={ref} args={[part.geometry, part.material, instances.length]} castShadow receiveShadow dispose={null} raycast={() => {}} />
}

/** Loading and failure retain the supplied procedural model, never blank the city. */
export function AssetInstances({ assetId, instances, fallback }: { assetId: string; instances: AssetInstance[]; fallback?: ReactNode }) {
  const asset = getCityAsset(assetId)
  const [loaded, setLoaded] = useState<{ url: string; parts: Part[] } | null>(null)
  useEffect(() => {
    let active = true
    if (asset) loadParts(asset.url).then((parts) => { if (active) setLoaded({ url: asset.url, parts }) }).catch(() => { if (active) setLoaded(null) })
    return () => { active = false }
  }, [asset?.url])
  if (!asset || !loaded || loaded.url !== asset.url) return <>{fallback}</>
  return <group dispose={null}>{loaded.parts.map((part, i) => <PartInstances key={i} part={part} instances={instances} />)}</group>
}

/** Shared model renderer for the gallery, shop previews and placed decorations. */
export function SceneAsset({ assetId, width = 1, height, fallback }: { assetId: string; width?: number; height?: number; fallback?: ReactNode }) {
  const asset = getCityAsset(assetId)
  const instances = useMemo<AssetInstance[]>(() => [{ position: [0, 0, 0], scale: [width, height && asset ? height / asset.height : width, width] }], [width, height, asset])
  return <AssetInstances assetId={assetId} instances={instances} fallback={fallback} />
}
