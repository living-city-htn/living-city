'use client'

/**
 * The cartoon city (PRD 8.11, docs/02 section 4.5).
 *
 * Curated shared GLB assets sit on deterministic polygon slabs. Procedural
 * geometry remains available while assets load or if a request fails.
 *
 * Placement comes from packages/modeling, which is pure and tested: the same
 * plan and community id always build the same block (docs/02 section 9).
 *
 * Props and events are exactly docs/roles/3d.md. `blockPick` emits [lon, lat],
 * not scene space, because the post flow uses it as a location (PRD 8.12).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { AssetInstances, SceneAsset, type AssetInstance } from './SceneAsset'
import { buildingAsset, decorationAsset, waterCell, vegetationAsset, plazaDecorations } from './asset-layout'
import * as THREE from 'three'
import { getCityAsset, placeBlock, toLocalMetres, type Cell } from '@living-city/modeling'
import type { CitySceneProps } from '@/components/city/types'
import type { CommunityGeo, CommunityPlan } from '@living-city/fixtures'

/**
 * Metres per scene unit, computed from the city's own extent so the whole city
 * lands about `CITY_UNITS` across whatever its real size is. A fixed number
 * framed Kitchener-Waterloo at roughly two hundred units and the camera opened
 * inside a single block.
 */
const CITY_UNITS = 26
const M_PER_DEG_LAT = 111_320

/**
 * How long the city takes to settle into a new frame, matching --slow in the
 * stylesheet so the scene and the layout around it move over the same beat.
 */
const ZOOM_MS = 320

type Palette = { ground: string; wall: string[]; roof: string; foliage: string; accent: string }

/** Four real palettes; anything else aliases, which docs/04 section 3 allows. */
const PALETTES: Record<string, Palette> = {
  warm_pastel: { ground: '#e9e2d6', wall: ['#f0dfc8', '#e6cdb0', '#f5e7d6'], roof: '#c98b6b', foliage: '#8fae74', accent: '#e8a765' },
  cool_pastel: { ground: '#dde4ea', wall: ['#dbe6f0', '#c8d8e8', '#eaf1f7'], roof: '#7d93ab', foliage: '#86a98f', accent: '#7fb0d8' },
  earthy_green: { ground: '#dfe6d8', wall: ['#e4e6d8', '#d2d9c4', '#eef0e4'], roof: '#7d8f63', foliage: '#6f9558', accent: '#9ac07a' },
  brick_red: { ground: '#e8ddd8', wall: ['#d99a84', '#c8806c', '#e8b39c'], roof: '#8f4f3d', foliage: '#87a274', accent: '#d97b5a' },
  sunset_orange: { ground: '#f0e0cf', wall: ['#f4c79a', '#eda971', '#f7dcbd'], roof: '#c2653a', foliage: '#93a86f', accent: '#ff9d4d' },
  soft_grey: { ground: '#e4e4e6', wall: ['#e0e0e4', '#cfcfd4', '#efeff2'], roof: '#8b8b92', foliage: '#8fa085', accent: '#a8a8b0' },
}
const paletteOf = (name?: string) => PALETTES[name ?? ''] ?? PALETTES.soft_grey!

function ringOf(c: CommunityGeo): Array<[number, number]> {
  const ring = c.polygon_block.coordinates[0] ?? []
  const out: Array<[number, number]> = []
  for (const p of ring) {
    const [lon, lat] = p
    if (typeof lon === 'number' && typeof lat === 'number') out.push([lon, lat])
  }
  return out
}

/**
 * Pulls the camera back far enough that the whole city is in frame on any
 * shape of viewport. A fixed distance fits a laptop and loses the city off the
 * sides of a portrait phone, where the horizontal field of view is far
 * narrower than the vertical one. PRD 8.11: the whole city fits at default
 * zoom.
 */
function FrameCity({ radius }: { radius: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const framedAt = useRef<number | null>(null)
  // Where the magnification is travelling, and since when.
  const zoomFrom = useRef(1)
  const zoomTo = useRef(1)
  const startedAt = useRef(0)

  /*
   * Only the first fit moves the camera. Every later one changes magnification
   * instead, because moving the camera on a resize throws away whatever the
   * person was looking at — and the viewport resizes constantly: opening a
   * block's card insets it, and on a phone the URL bar sliding away does too.
   * Tapping a block used to reset your orbit, your pan and your pinch, which
   * read on screen as the map lurching.
   *
   * `fit` is the distance at which the city exactly fills the frame, so
   * `framedAt / fit` is the magnification that holds its apparent size through
   * any change of shape. It is absolute rather than accumulated, so closing the
   * card returns the zoom to exactly 1 with nothing left drifting.
   *
   * This works because nothing else writes `zoom`: OrbitControls dollies a
   * perspective camera by moving it, and only touches `zoom` for an
   * orthographic one. If this scene ever goes orthographic, that stops being
   * true and this has to go back to driving distance. Picking is unaffected —
   * unprojection runs through the projection matrix, which includes zoom.
   *
   * A layout effect, not an effect: React Three Fiber has already written the
   * new aspect into the camera by this point, and the correction has to land in
   * the same frame or the city visibly pops before it settles.
   */
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    // A collapsed viewport has no aspect worth fitting to; wait for a real one.
    if (size.width < 2 || size.height < 2) return
    const vFov = (cam.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (size.width / size.height))
    const fit = Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) * 1.04
    if (framedAt.current === null) {
      framedAt.current = fit
      cam.position.set(0, fit * 0.66, fit * 0.78)
      cam.zoom = 1
      zoomFrom.current = 1
      zoomTo.current = 1
      cam.updateProjectionMatrix()
      return
    }
    // Aimed at, not jumped to: the frame it belongs in is still moving.
    const want = framedAt.current / fit
    if (Math.abs(want - zoomTo.current) < 1e-4) return
    // From wherever it is now, so a change that lands mid-travel bends the
    // path instead of snapping back to the start of it.
    zoomFrom.current = cam.zoom
    zoomTo.current = want
    startedAt.current = performance.now()
  }, [camera, size.width, size.height, radius])

  /*
   * Ease into the new framing rather than cutting to it, on the clock rather
   * than on the frame.
   *
   * Moving a fraction of the remaining distance each frame looks like an ease
   * until a frame runs long, and the frame this has to survive is the one where
   * the canvas reallocates its drawing buffer — tens of milliseconds with the
   * whole city in it. One long frame was enough for the step to reach the
   * target in a single go, so the magnification arrived instantly at exactly
   * the moment it most needed not to. Elapsed time cannot be skipped that way.
   */
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (cam.zoom === zoomTo.current) return
    const t = Math.min(1, (performance.now() - startedAt.current) / ZOOM_MS)
    // Matches --ease, the curve the rest of the interface moves on.
    const eased = 1 - Math.pow(1 - t, 3)
    cam.zoom = t >= 1
      ? zoomTo.current
      : zoomFrom.current + (zoomTo.current - zoomFrom.current) * eased
    cam.updateProjectionMatrix()
  })

  return null
}

/**
 * The event look, which is what moment 4 is actually selling.
 *
 * Before this the only thing a festival changed was the light: the plan asked
 * for a crowd, music notes and string lights and the scene drew none of them,
 * so the presenter said four things out loud and one of them was on screen.
 * These are primitives like everything else here — no asset pack — but they
 * move, and movement is what reads from the back of a room.
 */

/** Mulberry32 on a string seed: a block scatters the same way every render. */
function seeded(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Shared scratch object; instanced matrices are written one at a time. */
const dummy = new THREE.Object3D()

/**
 * People. Count comes from the plan's own pedestrian density and cluster
 * count, so a quiet block stays empty and the festival fills up.
 */
function Crowd({ count, spread, seed, colour }: {
  count: number
  spread: number
  seed: string
  colour: string
}) {
  const reducedMotion = useReducedMotion()
  const mesh = useRef<THREE.InstancedMesh>(null)
  const people = useMemo(() => {
    const r = seeded(`crowd:${seed}`)
    return Array.from({ length: count }, () => ({
      x: (r() * 2 - 1) * spread,
      z: (r() * 2 - 1) * spread,
      phase: r() * Math.PI * 2,
      speed: 1.4 + r() * 1.6,
    }))
  }, [count, spread, seed])

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const t = reducedMotion ? 0 : clock.elapsedTime
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!
      // A small hop rather than a walk cycle: at this scale the motion is the
      // whole signal, and a bobbing dot reads as a person in a crowd.
      dummy.position.set(p.x, 0.3 + Math.abs(Math.sin(t * p.speed + p.phase)) * 0.05, p.z)
      dummy.rotation.set(0, p.phase, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} castShadow>
      <capsuleGeometry args={[0.026, 0.055, 2, 5]} />
      <meshLambertMaterial color={colour} />
    </instancedMesh>
  )
}

/**
 * One look per effect in the taxonomy. Nothing new is invented here: these are
 * the values docs/03 section 5.3 already allows, given a colour and a motion
 * so the scene can draw the ones a plan asks for.
 */
const EFFECT_LOOK: Record<string, { colour: string; rise: number; spin: number; size: number }> = {
  music_notes: { colour: '#46495e', rise: 0.42, spin: 1.7, size: 0.075 },
  sparkles: { colour: '#ffd583', rise: 0.38, spin: 2.4, size: 0.05 },
  fireflies: { colour: '#ffe08a', rise: 0.12, spin: 0.4, size: 0.045 },
  confetti: { colour: '#ff8fb1', rise: -0.45, spin: 3.4, size: 0.055 },
  falling_leaves: { colour: '#c98b4b', rise: -0.3, spin: 2.2, size: 0.06 },
  snow: { colour: '#ffffff', rise: -0.25, spin: 0.5, size: 0.045 },
  rain: { colour: '#9fb6cc', rise: -1.1, spin: 0, size: 0.035 },
  steam: { colour: '#dfe4e8', rise: 0.3, spin: 0.3, size: 0.07 },
  fog: { colour: '#d8dde2', rise: 0.05, spin: 0.2, size: 0.1 },
  birds: { colour: '#5b6472', rise: 0.08, spin: 1.1, size: 0.05 },
  fireworks: { colour: '#ffd166', rise: 0.7, spin: 2.8, size: 0.06 },
  heart_particles: { colour: '#ff7f9e', rise: 0.34, spin: 1.5, size: 0.055 },
}

/** Floating particles over a block, one instanced mesh per effect. */
function Effect({ tag, spread, seed }: { tag: string; spread: number; seed: string }) {
  const look = EFFECT_LOOK[tag] ?? EFFECT_LOOK.sparkles!
  const COUNT = 14
  const parts = useMemo(() => {
    const r = seeded(`fx:${tag}:${seed}`)
    return Array.from({ length: COUNT }, () => ({
      x: (r() * 2 - 1) * spread,
      z: (r() * 2 - 1) * spread,
      offset: r(),
      tilt: r() * Math.PI,
    }))
  }, [tag, spread, seed])

  const reducedMotion = useReducedMotion()
  const mesh = useRef<THREE.InstancedMesh>(null)
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const t = reducedMotion ? 0 : clock.elapsedTime
    const SPAN = 1.1
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!
      // Loop through the span so particles stream rather than drift away.
      const travel = (((t * look.rise) / SPAN + p.offset) % 1 + 1) % 1
      dummy.position.set(p.x, 0.42 + travel * SPAN, p.z)
      dummy.rotation.set(p.tilt, t * look.spin + p.tilt, 0)
      dummy.scale.setScalar(look.size)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 0.3]} />
      {/* Basic, not Lambert: these are meant to glow, not take the sun. */}
      <meshBasicMaterial color={look.colour} transparent opacity={0.92} />
    </instancedMesh>
  )
}

/**
 * A decoration prop. The shop sells these and a plan asks for them, so the
 * same component draws both: what a judge buys in moment 5 is what a plan
 * puts on the block in moment 4.
 */
function ProceduralDecoration({ tag, palette }: { tag: string; palette: Palette }) {
  switch (tag) {
    case 'bike_racks':
      return <group>{[-0.1, 0, 0.1].map((x) => <mesh key={x} position={[x, 0.08, 0]}><torusGeometry args={[0.07, 0.012, 4, 8, Math.PI]} /><meshLambertMaterial color="#8d979b" /></mesh>)}</group>
    case 'string_lights':
    case 'lanterns':
      return (
        <group>
          {[-0.28, -0.09, 0.09, 0.28].map((x, i) => (
            <mesh key={i} position={[x, 0.3 - Math.abs(x) * 0.22, 0]}>
              <sphereGeometry args={[0.035, 6, 6]} />
              <meshBasicMaterial color="#ffce7a" />
            </mesh>
          ))}
        </group>
      )
    case 'stage':
      return (
        <group>
          <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.1, 0.3]} />
            <meshLambertMaterial color={palette.roof} />
          </mesh>
          <mesh position={[0, 0.26, -0.12]}>
            <boxGeometry args={[0.44, 0.32, 0.03]} />
            <meshLambertMaterial color={palette.accent} />
          </mesh>
        </group>
      )
    case 'food_trucks':
    case 'market_stalls':
    case 'kiosks':
      return (
        <group>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.3, 0.22, 0.18]} />
            <meshLambertMaterial color={palette.accent} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <boxGeometry args={[0.36, 0.05, 0.24]} />
            <meshLambertMaterial color={palette.roof} />
          </mesh>
        </group>
      )
    case 'benches':
      return (
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.26, 0.05, 0.1]} />
          <meshLambertMaterial color={palette.roof} />
        </mesh>
      )
    case 'fountain':
    case 'fountain_plaza':
      return (
        <group>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.18, 0.1, 12]} />
            <meshLambertMaterial color={palette.roof} />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.16, 6]} />
            <meshBasicMaterial color="#bcd9ea" />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh position={[0, 0.13, 0]} castShadow>
          <boxGeometry args={[0.2, 0.26, 0.2]} />
          <meshLambertMaterial color={palette.accent} />
        </mesh>
      )
  }
}

function Decoration({ tag, palette }: { tag: string; palette: Palette }) {
  const assetId = decorationAsset[tag]
  const fallback = <ProceduralDecoration tag={tag} palette={palette} />
  return assetId ? <SceneAsset assetId={assetId} width={tag === 'stage' ? 0.52 : 0.38} fallback={fallback} /> : fallback
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** A shoreline remains inside its reserved cell; the cell's building is removed. */
function Pond({ cell, scale }: { cell: Cell; scale: number }) {
  const shape = useMemo(() => {
    const result = new THREE.Shape()
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12
      const radius = cell.size / scale * (0.38 + Math.sin(angle * 3 + cell.variant) * 0.035)
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius * 0.78
      if (i === 0) result.moveTo(x, y)
      else result.lineTo(x, y)
    }
    result.closePath()
    return result
  }, [cell, scale])
  return <group position={[cell.x / scale, 0.272, -cell.y / scale]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 1]}><shapeGeometry args={[shape]} /><meshLambertMaterial color="#d7d8c5" /></mesh>
    <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}><shapeGeometry args={[shape]} /><meshLambertMaterial color="#97bcc6" /></mesh>
  </group>
}

/** A block: slab, its buildings, its planting, and whatever is in its slots. */
function Block({
  community, plan, origin, cells, scale, state, planning, slots, terrainSlots, placements, onHover, onSelect, onPick, onSlotTap,
}: {
  scale: number
  community: CommunityGeo
  plan: CommunityPlan | undefined
  origin: [number, number]
  cells: Cell[]
  state: 'idle' | 'hovered' | 'selected'
  planning: boolean
  terrainSlots: Array<{ x: number; y: number }>
  slots: Array<{ slot_id: string; x: number; y: number }>
  placements: Map<string, string>
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onPick: (id: string, point: [number, number]) => void
  onSlotTap?: (communityId: string, slotId: string) => void
}) {
  const reducedMotion = useReducedMotion()
  const group = useRef<THREE.Group>(null)
  const SCALE = scale
  const palette = paletteOf(plan?.palette)
  const lift = state === 'selected' ? 0.55 : state === 'hovered' ? 0.28 : 0

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    // Damped so selection feels physical rather than snapping.
    g.position.y += (lift - g.position.y) * (reducedMotion ? 1 : Math.min(1, delta * 9))
  })

  // One projection of the ring, shared by the slab, the slots and the scatter.
  // It used to be recomputed inside the slot loop, so every block paid for it
  // three more times on every render.
  const local = useMemo(
    () => ringOf(community).map((p) => toLocalMetres(p, community.centroid as [number, number])),
    [community],
  )
  const halfW = useMemo(() => Math.max(...local.map((p) => Math.abs(p[0]))) / SCALE, [local, SCALE])
  const halfH = useMemo(() => Math.max(...local.map((p) => Math.abs(p[1]))) / SCALE, [local, SCALE])

  const shape = useMemo(() => {
    const s = new THREE.Shape()
    local.forEach(([x, y], i) => {
      const px = x / SCALE
      const pz = y / SCALE
      if (i === 0) s.moveTo(px, pz)
      else s.lineTo(px, pz)
    })
    s.closePath()
    return s
  }, [local, SCALE])

  const slab = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }),
    [shape],
  )

  const festive = plan?.mood === 'festive'

  /*
   * How many people to draw. Density carries most of it and clusters add a
   * little on top, capped so a busy block stays readable rather than becoming
   * a smear. A plan with no activity at all draws nobody.
   */
  const crowdCount = Math.min(
    20,
    Math.round((plan?.activity.pedestrian_density ?? 0) * 2.4 + (plan?.activity.crowd_clusters ?? 0) * 1.6),
  )

  /*
   * An open cell is where a decoration goes. The plan names them in priority
   * order, so they are dealt round the open cells: a block that asks for
   * string lights and a stage gets a string of lights and a stage, instead of
   * the one anonymous box every festive block used to get. Worked out up
   * front rather than counted during the render.
   */
  const pondIndex = useMemo(() => waterCell(cells, local, community.land_use_hints.water_adjacent,
    terrainSlots.map((slot) => [slot.x * halfW * 0.62 * SCALE, slot.y * halfH * 0.62 * SCALE])),
  [cells, local, community.land_use_hints.water_adjacent, terrainSlots, halfW, halfH, SCALE])
  const assetGroups = useMemo(() => {
    const groups = new Map<string, { instances: AssetInstance[]; indices: number[] }>()
    cells.forEach((cell, i) => {
      if (i === pondIndex || cell.kind === 'plaza') return
      const id = cell.kind === 'building' ? buildingAsset(cell, community.land_use_hints.campus) : vegetationAsset(plan?.vegetation.types ?? [], cell.variant)
      const width = cell.size / SCALE * (cell.kind === 'building' ? 0.72 : 0.42)
      const group = groups.get(id) ?? { instances: [], indices: [] }
      group.instances.push({ position: [cell.x / SCALE, 0.26, -cell.y / SCALE], scale: [width, cell.kind === 'building' ? width * Math.max(0.8, Math.min(1.3, ((cell.storeys ?? 1) * 0.16) / ((getCityAsset(id)?.height ?? 1) * width))) : width, width], rotation: Math.floor(cell.variant * 4) * Math.PI / 2 })
      group.indices.push(i)
      groups.set(id, group)
    })
    return groups
  }, [cells, pondIndex, community.land_use_hints.campus, plan?.vegetation.types, SCALE])
  const proceduralCell = (cell: Cell, i: number) => {
    const width = cell.size / SCALE * 0.72
    const height = cell.kind === 'building' ? (cell.storeys ?? 1) * 0.16 : width * 1.3
    return <mesh key={i} position={[cell.x / SCALE, 0.26 + height / 2, -cell.y / SCALE]} castShadow receiveShadow>
      {cell.kind === 'building' ? <boxGeometry args={[width, height, width]} /> : <coneGeometry args={[width / 2, height, 7]} />}
      <meshLambertMaterial color={cell.kind === 'building' ? palette.wall[0] : palette.foliage} />
    </mesh>
  }

  return (
    <group ref={group} position={[origin[0], 0, origin[1]]}>
      {/* The slab is the only hit target, so the whole block is tappable. */}
      <mesh
        geometry={slab}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(community.community_id) }}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect(community.community_id)
          const [clon, clat] = community.centroid as [number, number]
          const k = Math.cos((clat * Math.PI) / 180)
          onPick(community.community_id, [
            clon + ((e.point.x - origin[0]) * SCALE) / (M_PER_DEG_LAT * k),
            clat + ((-(e.point.z - origin[1])) * SCALE) / M_PER_DEG_LAT,
          ])
        }}
      >
        <meshLambertMaterial color={planning ? '#cfe0ff' : palette.ground} />
      </mesh>

      {/* A festive block lights itself, and only itself. */}
      {festive && <pointLight position={[0, 1.1, 0]} intensity={2.2} distance={4.5} color="#ffb765" />}

      {/* The people the plan asked for, and the particles over their heads. */}
      {crowdCount > 0 && (
        <Crowd
          count={crowdCount}
          spread={Math.min(halfW, halfH) * 0.66}
          seed={community.community_id}
          colour={palette.roof}
        />
      )}
      {(plan?.effects ?? []).slice(0, 3).map((tag) => (
        <Effect key={tag} tag={tag} spread={Math.min(halfW, halfH) * 0.7} seed={community.community_id} />
      ))}

      {Array.from(assetGroups, ([assetId, group]) => <AssetInstances key={assetId} assetId={assetId} instances={group.instances}
        fallback={<>{group.indices.map((i) => proceduralCell(cells[i]!, i))}</>} />)}
      {pondIndex >= 0 && <Pond cell={cells[pondIndex]!} scale={SCALE} />}
      {cells.map((cell, i) => {
        if (cell.kind !== 'plaza') return null
        const x = cell.x / SCALE
        const z = -cell.y / SCALE
        const w = (cell.size / SCALE) * 0.82
        const decorations = plazaDecorations((plan?.decorations ?? []).map((entry) => entry.tag))
        return (
          <group key={i} position={[x, 0.27, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[w * 0.55, 16]} />
              <meshLambertMaterial color={palette.accent} />
            </mesh>
            {decorations.map((decoration, index) => <group key={`${decoration.tag}-${index}`} position={[decoration.x * w, 0, decoration.z * w]} scale={Math.min(1, w * 0.78)}>
              <Decoration tag={decoration.tag} palette={palette} />
              {decoration.tag === 'outdoor_seating' && <group position={[0.23, 0, 0]}><SceneAsset assetId="chair-01" width={0.14} /></group>}
            </group>)}
          </group>
        )
      })}

      {/* Slots sit on a fraction of the block's own extent, like the flat scene. */}
      {slots.map((slot) => {
        const held = placements.get(`${community.community_id}/${slot.slot_id}`)
        return (
          <group key={slot.slot_id} position={[slot.x * halfW * 0.62, 0.27, -slot.y * halfH * 0.62]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSlotTap?.(community.community_id, slot.slot_id) }}
            >
              <ringGeometry args={[0.12, 0.18, 18]} />
              <meshBasicMaterial color={held ? palette.accent : '#8d9a91'} />
            </mesh>
            {/* What was bought, drawn as itself: a bench looks like a bench. */}
            {held && <Decoration tag={held} palette={palette} />}
          </group>
        )
      })}
    </group>
  )
}

/**
 * The scene takes its surround from the app's own CSS variables rather than
 * hardcoding a colour. The interface has been restyled three times during the
 * build; a scene painted to match one of those revisions goes wrong on the
 * next one, and a warm ground under a white interface is exactly how that
 * looks.
 */
function useShellColours() {
  const [colours, setColours] = useState({ background: '#FFFFFF', ground: '#FFFFFF' })
  useEffect(() => {
    const read = (name: string, fallback: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return v || fallback
    }
    // Both the page colour. The deployed app shows the city on plain white, so
    // the ground plane disappears into it and only the blocks and their soft
    // shadows are left — which is the whole point of a miniature on a board.
    const paper = read('--paper', '#FFFFFF')
    setColours({ background: paper, ground: paper })
  }, [])
  return colours
}

export default function CityScene({
  city, plans, placements, mode, selectedId, planningIds,
  onBlockHover, onBlockSelect, onBlockPick, onSlotTap,
}: CitySceneProps) {
  // R3F cannot render on the server, so wait for the client.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const shell = useShellColours()

  const planFor = useMemo(() => new Map(plans.map((p) => [p.community_id, p])), [plans])
  const held = useMemo(
    () => new Map(placements.map((p) => [`${p.community_id}/${p.slot_id}`, p.item_tag])),
    [placements],
  )

  /**
   * The middle of the city's extent, not the average of its centroids. Averaging
   * centroids pulls toward wherever the small blocks cluster, which left the
   * city sitting low and to one side of the frame.
   */
  const centre = useMemo<[number, number]>(() => {
    const pts = city.communities.flatMap(ringOf)
    if (pts.length === 0) return [0, 0]
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  }, [city.communities])

  /** Metres across the whole city, used to pick the scale. */
  const scale = useMemo(() => {
    const pts = city.communities.flatMap((c) =>
      ringOf(c).map((p) => toLocalMetres(p, centre)),
    )
    if (pts.length === 0) return 40
    const spanX = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))
    const spanY = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))
    return Math.max(spanX, spanY) / CITY_UNITS
  }, [city.communities, centre])

  const blocks = useMemo(
    () =>
      city.communities.map((community) => {
        const plan = planFor.get(community.community_id)
        const [mx, my] = toLocalMetres(community.centroid as [number, number], centre)
        return {
          community,
          plan,
          origin: [mx / scale, -my / scale] as [number, number],
          cells: placeBlock({
            communityId: community.community_id,
            ring: ringOf(community),
            centroid: community.centroid as [number, number],
            lotCount: community.capacity.lot_count,
            maxHeightTier: community.capacity.max_height_tier,
            density: plan?.density ?? 2,
            composition: plan?.building_composition ?? { residential: 100 },
            heightProfile: plan?.height_profile ?? 'low',
            vegetationLevel: plan?.vegetation.level ?? 2,
            crowdClusters: Math.max(plan?.activity.crowd_clusters ?? 0, plan?.decorations.length ? 1 : 0),
          }),
        }
      }),
    [city.communities, planFor, centre, scale],
  )

  if (!ready) return null

  return (
    /*
     * `flat` turns off ACES filmic tone mapping. With it on, the near-white
     * ground under this much light clipped to a warm tan — which is why the
     * scene looked nothing like the white interface around it. Flat renders
     * the colours as authored, which is what a cartoon miniature wants
     * anyway (PRD 8.11: flat or toon shaded, no photographic treatment).
     */
    <Canvas
      flat
      shadows
      dpr={[1, 1.8]}
      camera={{ position: [0, 17, 23], fov: 40 }}
      style={{ width: '100%', height: '100%' }}
      /*
       * The layer holding this canvas animates when a screen makes room for a
       * panel. Measured with no delay, every frame of that animation
       * reallocates the drawing buffer — several megabytes, a dozen times over
       * a fifth of a second, which is exactly when a phone can least afford
       * it. Waiting for the movement to stop means one reallocation instead.
       * The picture stretches a little while it settles; a hitch is worse.
       */
      resize={{ scroll: false, debounce: { scroll: 50, resize: 90 } }}
    >
      <color attach="background" args={[shell.background]} />
      {/*
        No fog. The camera distance changes with the viewport shape, so a fixed
        fog band that looked like haze on a laptop bleached the whole city on a
        portrait phone, where the camera sits much further back.
      */}
      {/*
        Neutral, always. These were tinted warm whenever any block was festive,
        which meant one festive block washed the entire city — and the ground —
        orange. Lighting is a property of a plan, so a festive block carries its
        own warm light below instead.
      */}
      <ambientLight intensity={0.9} color="#ffffff" />
      <directionalLight
        position={[14, 22, 10]}
        intensity={1.35}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <FrameCity radius={CITY_UNITS * 0.5} />

      {blocks.map(({ community, plan, origin, cells }) => (
        <Block
          key={community.community_id}
          community={community}
          plan={plan}
          origin={origin}
          cells={cells}
          scale={scale}
          state={selectedId === community.community_id ? 'selected' : 'idle'}
          planning={planningIds.includes(community.community_id)}
          terrainSlots={city.slots.filter((s) => s.community_id === community.community_id)}
          slots={mode === 'mine' ? city.slots.filter((s) => s.community_id === community.community_id) : []}
          placements={held}
          onHover={(id) => onBlockHover?.(id)}
          onSelect={(id) => onBlockSelect?.(id)}
          onPick={(id, point) => onBlockPick?.(id, point)}
          onSlotTap={onSlotTap}
        />
      ))}

      {/* Tap empty space to deselect (PRD 8.12). */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={() => onBlockSelect?.(null)} receiveShadow>
        <planeGeometry args={[400, 400]} />
        {/*
          Shadow-only, so the ground IS the page colour with the blocks'
          shadows on it. A lit white plane renders as grey — it can only
          reflect the light that reaches it — which read as a grey slab cut
          into a white interface.
        */}
        <shadowMaterial opacity={0.14} />
      </mesh>

      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={9}
        maxDistance={90}
        minPolarAngle={Math.PI / 9}
        maxPolarAngle={Math.PI / 2.35}
      />
    </Canvas>
  )
}
