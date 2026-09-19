'use client'

import { useEffect, useRef, useState } from 'react'
import { Box3, Color, DirectionalLight, GridHelper, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Texture, Vector3, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CITY_ASSETS, type CityAsset } from '@living-city/modeling'

declare global { interface Window { __captureAssetThumbnail?: (id: string) => Promise<string> } }

function disposeModel(model: Group) {
  model.traverse(child => {
    if (!(child instanceof Mesh)) return
    child.geometry.dispose()
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
      material.dispose()
    }
  })
}

/** One renderer for the gallery and deterministic static catalogue captures. */
export default function AssetPreview({ asset }: { asset: CityAsset }) {
  const host = useRef<HTMLDivElement>(null)
  const selectModel = useRef<((asset: CityAsset) => Promise<boolean>) | null>(null)
  const [status, setStatus] = useState('Loading model…')
  useEffect(() => {
    if (!host.current) return
    let renderer: WebGLRenderer
    try { renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }) }
    catch { setStatus('3D preview unavailable. Asset details and downloads remain available below.'); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(new Color('#ffffff'))
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, 1, 0.01, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 0.8
    controls.maxDistance = 12
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    const light = new DirectionalLight('#fff6e9', 2.8)
    light.position.set(3, 6, 5)
    scene.add(light, new HemisphereLight('#ffffff', '#c9d0d4', 2.2))
    const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: '#ffffff', roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.015
    scene.add(floor)
    const grid = new GridHelper(4, 8, '#b7c0c7', '#e6eaed')
    grid.position.y = -0.01
    scene.add(grid)
    const container = host.current
    container.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-label', 'Interactive model preview. Drag to rotate; pinch or scroll to zoom.')
    let model: Group | null = null
    let version = 0
    let stopped = false
    const render = () => { if (!stopped) renderer.render(scene, camera) }
    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    controls.addEventListener('change', render)
    renderer.domElement.tabIndex = 0
    const initialPosition = new Vector3()
    const keyboard = (event: KeyboardEvent) => {
      const offset = camera.position.clone().sub(controls.target)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') offset.applyAxisAngle(new Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -.15 : .15)
      else if (event.key === '+' || event.key === '=') offset.multiplyScalar(.9)
      else if (event.key === '-') offset.multiplyScalar(1.1)
      else if (event.key === '0' || event.key === 'Home') offset.copy(initialPosition).sub(controls.target)
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') offset.y += event.key === 'ArrowUp' ? .15 : -.15
      else return
      event.preventDefault()
      camera.position.copy(controls.target).add(offset)
      controls.update()
      render()
    }
    renderer.domElement.addEventListener('keydown', keyboard)
    const loader = new GLTFLoader()
    const load = async (next: CityAsset) => {
      const request = ++version
      setStatus('Loading model…')
      if (model) model.visible = false
      render()
      try {
        const gltf = await loader.loadAsync(next.url)
        if (stopped || request !== version) { disposeModel(gltf.scene); return false }
        if (model) { scene.remove(model); disposeModel(model) }
        model = gltf.scene
        scene.add(model)
        const bounds = new Box3().setFromObject(model)
        const center = bounds.getCenter(new Vector3())
        const size = bounds.getSize(new Vector3())
        const radius = Math.max(size.x, size.y, size.z, 0.8)
        controls.target.set(center.x, center.y, center.z)
        camera.position.set(center.x + radius * 1.9, center.y + radius * 1.3, center.z + radius * 2.2)
        initialPosition.copy(camera.position)
        controls.update()
        render()
        setStatus('')
        return true
      } catch { if (request === version && !stopped) setStatus('This model could not load. Select another asset or reload to try again.'); return false }
    }
    selectModel.current = load
    window.__captureAssetThumbnail = async id => {
      const next = CITY_ASSETS.find(item => item.id === id)
      if (!next) throw new Error(`Unknown asset: ${id}`)
      if (!await load(next)) throw new Error(`Could not load asset: ${id}`)
      grid.visible = false
      const oldSize = { width: container.clientWidth, height: container.clientHeight }
      renderer.setPixelRatio(1)
      renderer.setSize(256, 256, false)
      camera.aspect = 1
      camera.updateProjectionMatrix()
      render()
      const result = renderer.domElement.toDataURL('image/png')
      grid.visible = true
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(oldSize.width, oldSize.height)
      camera.aspect = oldSize.width / oldSize.height
      camera.updateProjectionMatrix()
      render()
      return result
    }
    resize()
    return () => {
      stopped = true
      version++
      selectModel.current = null
      delete window.__captureAssetThumbnail
      observer.disconnect()
      renderer.domElement.removeEventListener('keydown', keyboard)
      controls.dispose()
      if (model) disposeModel(model)
      floor.geometry.dispose()
      ;(floor.material as MeshStandardMaterial).dispose()
      grid.geometry.dispose()
      for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // The scene and renderer survive selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (selectModel.current) void selectModel.current(asset) }, [asset])
  return <div className="asset-preview-wrap"><div ref={host} className="asset-preview" />{status && <p className="asset-preview-status" role="status">{status}</p>}</div>
}
