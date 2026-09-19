'use client'

/**
 * The cartoon city (PRD 8.11, docs/02 section 4.5).
 *
 * Geometry is procedural: extruded slabs from the hand-drawn polygons, boxes
 * for buildings, cones for trees. No glTF pack, deliberately — the asset pack
 * and its manifest are 3D's Stage 0 items and this must not pre-empt what they
 * choose. Swapping a box for a loaded mesh later touches only this file.
 *
 * Placement comes from packages/modeling, which is pure and tested: the same
 * plan and community id always build the same block (docs/02 section 9).
 *
 * Props and events are exactly docs/roles/3d.md. `blockPick` emits [lon, lat],
 * not scene space, because the post flow uses it as a location (PRD 8.12).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { placeBlock, toLocalMetres, type Cell } from '@living-city/modeling'
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

/** Category tints the wall choice so a block's mix reads at a glance. */
const CATEGORY_TINT: Record<string, number> = {
  residential: 0, retail: 1, cafe_bar: 2, office: 1, cultural_civic: 2, campus_industrial: 0,
}

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
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const vFov = (cam.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (size.width / Math.max(size.height, 1)))
    const distance = Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) * 1.04
    cam.position.set(0, distance * 0.66, distance * 0.78)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, radius])
  return null
}

/** A block: slab, its buildings, its planting, and whatever is in its slots. */
function Block({
  community, plan, origin, cells, scale, state, planning, slots, placements, onHover, onSelect, onPick, onSlotTap,
}: {
  scale: number
  community: CommunityGeo
  plan: CommunityPlan | undefined
  origin: [number, number]
  cells: Cell[]
  state: 'idle' | 'hovered' | 'selected'
  planning: boolean
  slots: Array<{ slot_id: string; x: number; y: number }>
  placements: Map<string, string>
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onPick: (id: string, point: [number, number]) => void
  onSlotTap?: (communityId: string, slotId: string) => void
}) {
  const group = useRef<THREE.Group>(null)
  const SCALE = scale
  const palette = paletteOf(plan?.palette)
  const lift = state === 'selected' ? 0.55 : state === 'hovered' ? 0.28 : 0

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    // Damped so selection feels physical rather than snapping.
    g.position.y += (lift - g.position.y) * Math.min(1, delta * 9)
  })

  const shape = useMemo(() => {
    const local = ringOf(community).map((p) => toLocalMetres(p, community.centroid as [number, number]))
    const s = new THREE.Shape()
    local.forEach(([x, y], i) => {
      const px = x / SCALE
      const pz = y / SCALE
      if (i === 0) s.moveTo(px, pz)
      else s.lineTo(px, pz)
    })
    s.closePath()
    return s
  }, [community, SCALE])

  const slab = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }),
    [shape],
  )

  const festive = plan?.mood === 'festive'

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

      {cells.map((cell, i) => {
        const x = cell.x / SCALE
        const z = -cell.y / SCALE
        const w = (cell.size / SCALE) * 0.82
        if (cell.kind === 'building') {
          const h = (cell.storeys ?? 1) * 0.16
          const wall = palette.wall[CATEGORY_TINT[cell.category ?? ''] ?? 0] ?? palette.wall[0]!
          return (
            <group key={i} position={[x, 0.26, z]}>
              <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[w, h, w]} />
                <meshLambertMaterial color={wall} />
              </mesh>
              <mesh position={[0, h + 0.045, 0]} castShadow>
                <boxGeometry args={[w * 1.08, 0.09, w * 1.08]} />
                <meshLambertMaterial color={palette.roof} />
              </mesh>
              {festive && (
                <mesh position={[0, h + 0.16, 0]}>
                  <sphereGeometry args={[0.07, 8, 8]} />
                  <meshBasicMaterial color={palette.accent} />
                </mesh>
              )}
            </group>
          )
        }
        if (cell.kind === 'vegetation') {
          const th = 0.28 + cell.variant * 0.3
          return (
            <group key={i} position={[x, 0.26, z]}>
              <mesh position={[0, th / 2, 0]} castShadow>
                <coneGeometry args={[w * 0.36, th, 7]} />
                <meshLambertMaterial color={palette.foliage} />
              </mesh>
            </group>
          )
        }
        return (
          <group key={i} position={[x, 0.27, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[w * 0.55, 16]} />
              <meshLambertMaterial color={palette.accent} />
            </mesh>
            {festive && (
              <mesh position={[0, 0.22, 0]}>
                <boxGeometry args={[w * 0.5, 0.42, w * 0.12]} />
                <meshLambertMaterial color={palette.roof} />
              </mesh>
            )}
          </group>
        )
      })}

      {slots.map((slot) => {
        const held = placements.get(`${community.community_id}/${slot.slot_id}`)
        // Slots sit on a fraction of the block's own extent, like the flat scene.
        const local = ringOf(community).map((p) => toLocalMetres(p, community.centroid as [number, number]))
        const halfW = Math.max(...local.map((p) => Math.abs(p[0]))) / SCALE
        const halfH = Math.max(...local.map((p) => Math.abs(p[1]))) / SCALE
        return (
          <group key={slot.slot_id} position={[slot.x * halfW * 0.62, 0.27, -slot.y * halfH * 0.62]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSlotTap?.(community.community_id, slot.slot_id) }}
            >
              <ringGeometry args={[0.12, 0.18, 18]} />
              <meshBasicMaterial color={held ? palette.accent : '#8d9a91'} />
            </mesh>
            {held && (
              <mesh position={[0, 0.14, 0]} castShadow>
                <boxGeometry args={[0.2, 0.26, 0.2]} />
                <meshLambertMaterial color={palette.accent} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

export default function CityScene({
  city, plans, placements, mode, selectedId, planningIds,
  onBlockHover, onBlockSelect, onBlockPick, onSlotTap,
}: CitySceneProps) {
  // R3F cannot render on the server, so wait for the client.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const planFor = useMemo(() => new Map(plans.map((p) => [p.community_id, p])), [plans])
  const held = useMemo(
    () => new Map(placements.map((p) => [`${p.community_id}/${p.slot_id}`, p.item_tag])),
    [placements],
  )

  const centre = useMemo<[number, number]>(() => {
    const cs = city.communities.map((c) => c.centroid as [number, number])
    if (cs.length === 0) return [0, 0]
    return [
      cs.reduce((s, c) => s + c[0], 0) / cs.length,
      cs.reduce((s, c) => s + c[1], 0) / cs.length,
    ]
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
            crowdClusters: plan?.activity.crowd_clusters ?? 0,
          }),
        }
      }),
    [city.communities, planFor, centre, scale],
  )

  if (!ready) return null

  const anyFestive = blocks.some((b) => b.plan?.mood === 'festive')

  return (
    <Canvas shadows dpr={[1, 1.8]} camera={{ position: [0, 17, 23], fov: 40 }} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#eef1ee']} />
      {/*
        No fog. The camera distance changes with the viewport shape, so a fixed
        fog band that looked like haze on a laptop bleached the whole city on a
        portrait phone, where the camera sits much further back.
      */}
      <ambientLight intensity={1.5} color={anyFestive ? '#ffe9cf' : '#ffffff'} />
      <directionalLight
        position={[14, 22, 10]}
        intensity={2.1}
        color={anyFestive ? '#ffd9a8' : '#fff6e8'}
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
        <meshLambertMaterial color="#e4e9e4" />
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
