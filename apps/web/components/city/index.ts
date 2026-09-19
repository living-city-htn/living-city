/**
 * The swap seam. Every screen imports `CityScene` from here and never from
 * ./FlatCityScene or from @/scene directly.
 *
 * apps/web/scene is 3D's package (docs/05 section 2). While it exports nothing,
 * this resolves to Product's flat SVG. The moment 3D exports a `CityScene` from
 * it, this resolves to theirs and no Product file changes.
 *
 * Two things that may need a line here when that happens, and only here:
 *   - React Three Fiber usually wants `next/dynamic` with `ssr: false`.
 *   - If 3D ships the bare event names from docs/roles/3d.md (`blockHover`
 *     rather than `onBlockHover`), the adapter is a wrapper in this file.
 */
import type { ComponentType } from 'react'
import * as sceneModule from '@/scene'
import FlatCityScene from './FlatCityScene'
import type { CitySceneProps } from './types'

// If this line stops compiling, the fallback has drifted from the contract.
void (FlatCityScene satisfies ComponentType<CitySceneProps>)

const provided = (sceneModule as Record<string, unknown>).CityScene

/** True while the city is Product's flat outlines rather than 3D's scene. */
export const isFallbackScene = typeof provided !== 'function'

export const CityScene = (isFallbackScene ? FlatCityScene : provided) as ComponentType<CitySceneProps>

export type { CitySceneProps, CityPayload, Placement } from './types'
export default CityScene
