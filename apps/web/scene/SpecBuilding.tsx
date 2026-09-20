'use client'

/**
 * A described place, drawn. The model's `BuildingSpec` is bounded intent;
 * `buildingModel` in packages/modeling turns it into boxes, and this only
 * gives those boxes colours and puts them on the ground. Nothing here reads
 * what the model said except through that function.
 */
import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { buildingModel, type BuildingPart, type BuildingSpecLike } from '@living-city/modeling'

export type SpecColours = { wall: string; roof: string; accent: string }

const GLASS = '#a9c7d6'
const WINDOW_DARK = '#8fa7b5'
const WINDOW_LIT = '#ffd98a'
/** A footprint is about one unit wide; this is how wide a slot's building stands. */
const SLOT_WIDTH = 0.36
/** How far from the middle each prop stands, in scene units. */
const PROP_RADIUS = 0.3
const POP_SECONDS = 0.5

const colourOf = (part: BuildingPart, colours: SpecColours, lit: boolean) => {
  switch (part.role) {
    case 'roof': return colours.roof
    case 'accent': return colours.accent
    case 'glass': return GLASS
    case 'window': return lit ? WINDOW_LIT : WINDOW_DARK
    default: return colours.wall
  }
}

function Part({ part, colours, lit }: { part: BuildingPart; colours: SpecColours; lit: boolean }) {
  const [w, h, d] = part.size
  const [x, y, z] = part.position
  const colour = colourOf(part, colours, lit)
  // Lit windows glow rather than take the sun, the way string lights do.
  const material = part.role === 'window' && lit
    ? <meshBasicMaterial color={colour} />
    : <meshLambertMaterial color={colour} />

  if (part.shape === 'gable') {
    // A three-sided cylinder on its side is a prism: a pitched roof. Its
    // triangle is 1.732 wide and 1.5 tall, so the scale fits it to the part.
    const sy = h / 1.5
    return (
      <mesh position={[x, y - h / 2 + h / 3, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[w / 1.732, d, sy]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 3]} />
        {material}
      </mesh>
    )
  }
  if (part.shape === 'spire') {
    return (
      <mesh position={[x, y, z]} rotation={[0, Math.PI / 4, 0]} scale={[w, h, d]} castShadow>
        <coneGeometry args={[0.7071, 1, 4]} />
        {material}
      </mesh>
    )
  }
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow={part.role !== 'window'}>
      <boxGeometry args={[w, h, d]} />
      {material}
    </mesh>
  )
}

/**
 * `renderProp` is the scene's own decoration drawer, so a bench beside a
 * described cafe is the same bench the shop sells.
 */
export default function SpecBuilding({ spec, colours, renderProp, reducedMotion }: {
  spec: BuildingSpecLike
  colours: SpecColours
  renderProp: (tag: string) => ReactNode
  reducedMotion: boolean
}) {
  const model = buildingModel(spec)
  const group = useRef<THREE.Group>(null)
  const age = useRef(reducedMotion ? POP_SECONDS : 0)

  // It pops in, so a building the judge has just described is noticed arriving.
  useFrame((_, delta) => {
    const g = group.current
    if (!g || age.current >= POP_SECONDS) return
    age.current = Math.min(POP_SECONDS, age.current + delta)
    // Ease-out-back: overshoots a touch, then settles.
    const t = age.current / POP_SECONDS - 1
    g.scale.setScalar(Math.max(0.001, SLOT_WIDTH * (1 + 2.7 * t * t * t + 1.7 * t * t)))
  })

  return (
    <>
      <group ref={group} scale={reducedMotion ? SLOT_WIDTH : 0.001}>
        {model.parts.map((part, i) => <Part key={i} part={part} colours={colours} lit={model.lit} />)}
      </group>
      {model.props.map((tag, i) => {
        const angle = Math.PI * (0.35 + (i / Math.max(1, model.props.length)) * 1.3)
        return (
          <group
            key={`${tag}-${i}`}
            position={[Math.cos(angle) * PROP_RADIUS, 0, Math.sin(angle) * PROP_RADIUS]}
            scale={0.6}
          >
            {renderProp(tag)}
          </group>
        )
      })}
    </>
  )
}
