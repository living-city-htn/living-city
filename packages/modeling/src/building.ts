import { rng } from './placement'

/**
 * `BuildingSpec` -> 3D, the deterministic half of "AI ends at JSON".
 *
 * The model returned bounded intent (kind, storeys, tags). This turns that into
 * boxes. It is the only place a spec becomes shape: nothing the model said is a
 * coordinate, and the same spec always gives the same building, which is what
 * docs/02 section 9 means by replay.
 *
 * Pure and unit-free of React. Sizes are in footprint widths (the front of the
 * building is about 1 wide); the renderer scales the whole model to fit a slot
 * and maps `role` to a palette colour, so this file knows no colours.
 *
 * Structural input on purpose: `BuildingSpec` lives in `packages/pipeline`, and
 * modeling must not depend on it.
 */

export type BuildingSpecLike = {
  name: string
  kind: string
  height: string
  storeys: number
  mood: string
  identity_tags: readonly string[]
  features: readonly string[]
}

export type BuildingPart = {
  shape: 'box' | 'gable' | 'spire'
  /** Which palette slot colours it. `glass` and `window` are the lit ones. */
  role: 'wall' | 'roof' | 'accent' | 'glass' | 'window'
  /** Width, height, depth. */
  size: [number, number, number]
  /** Centre, with y measured up from the ground. */
  position: [number, number, number]
}

export type BuildingModel = {
  parts: BuildingPart[]
  /** Total height, so the renderer can frame and scale it. */
  height: number
  /** Decoration tags to stand around it, capped so a slot stays readable. */
  props: string[]
  /** Windows glow: a cosy or festive place is drawn with its lights on. */
  lit: boolean
}

type Trait = { w: number; d: number; awning?: boolean; roof?: 'gable' | 'flat' }

/** Footprint and character per place type. Anything unknown is a small pavilion. */
const TRAITS: Record<string, Trait> = {
  cafe: { w: 1, d: 0.8, awning: true },
  restaurant: { w: 1.1, d: 0.85, awning: true },
  bar: { w: 1, d: 0.8, awning: true },
  shop: { w: 1.1, d: 0.8, awning: true },
  market: { w: 1.4, d: 1, awning: true },
  office: { w: 0.9, d: 0.9 },
  school: { w: 1.5, d: 0.9 },
  home: { w: 0.9, d: 0.8, roof: 'gable' },
  venue: { w: 1.3, d: 1 },
  gym: { w: 1.2, d: 0.9 },
  transit: { w: 1.2, d: 0.6 },
}
const PAVILION: Trait = { w: 0.9, d: 0.9 }

const HEIGHT_PROFILE = ['low', 'low_mid', 'mid', 'mid_high', 'high']
const LIT_MOODS = new Set(['cozy', 'festive', 'vibrant', 'playful'])
const LIT_FEATURES = new Set(['string_lights', 'lanterns', 'neon_signs'])
const MAX_PROPS = 3

export function buildingModel(spec: BuildingSpecLike): BuildingModel {
  const random = rng(`building:${spec.name}`)
  const trait = TRAITS[spec.kind] ?? PAVILION
  const tags = new Set(spec.identity_tags)
  const storeys = Math.min(8, Math.max(1, Math.round(spec.storeys)))

  // The height profile stretches a storey a little, so a "high" place reads
  // taller than a "low" one with the same count. Index 0..4 -> 0.30..0.38.
  const storeyH = 0.3 + Math.max(0, HEIGHT_PROFILE.indexOf(spec.height)) * 0.02
  const w = trait.w * (0.9 + random() * 0.2)
  const d = trait.d * (0.9 + random() * 0.2)

  // Tall places set back as they rise, the way a podium and a tower do.
  const tiers = storeys >= 6 ? 3 : storeys >= 3 ? 2 : 1
  const perTier = [...Array(tiers)].map((_, i) => Math.floor(storeys / tiers) + (i < storeys % tiers ? 1 : 0))
  const wallRole = tags.has('glass') ? 'glass' : 'wall'

  const parts: BuildingPart[] = []
  let y = 0
  let tw = w
  let td = d
  perTier.forEach((count, tier) => {
    const h = count * storeyH
    parts.push({ shape: 'box', role: wallRole, size: [tw, h, td], position: [0, y + h / 2, 0] })
    // One lit strip per storey on the front, so the storey count is countable.
    for (let s = 0; s < count; s++) {
      parts.push({
        shape: 'box', role: 'window', size: [tw * 0.7, storeyH * 0.35, 0.02],
        position: [0, y + s * storeyH + storeyH * 0.55, td / 2 + 0.01],
      })
    }
    y += h
    if (tier < tiers - 1) { tw *= 0.82; td *= 0.82 }
  })

  const historic = tags.has('historic')
  const roof = trait.roof ?? (historic || tags.has('wood') || tags.has('cozy') ? 'gable' : 'flat')
  if (historic && storeys >= 5) {
    // A tall historic place is a clock tower: it earns a spire.
    parts.push({ shape: 'spire', role: 'roof', size: [tw * 0.9, storeyH * 2.2, td * 0.9], position: [0, y + storeyH * 1.1, 0] })
    y += storeyH * 2.2
  } else if (roof === 'gable' && storeys <= 3) {
    parts.push({ shape: 'gable', role: 'roof', size: [tw * 1.06, storeyH * 1.1, td * 1.06], position: [0, y + storeyH * 0.55, 0] })
    y += storeyH * 1.1
  } else {
    parts.push({ shape: 'box', role: 'roof', size: [tw * 1.06, 0.05, td * 1.06], position: [0, y + 0.025, 0] })
    y += 0.05
  }

  if (trait.awning) {
    parts.push({ shape: 'box', role: 'accent', size: [w * 0.9, 0.05, 0.22], position: [0, storeyH * 0.85, d / 2 + 0.11] })
  }

  return {
    parts,
    height: y,
    props: spec.features.slice(0, MAX_PROPS),
    lit: LIT_MOODS.has(spec.mood) || spec.features.some((f) => LIT_FEATURES.has(f)),
  }
}
