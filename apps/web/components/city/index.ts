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

/*
 * Read through a computed key on purpose. A direct `sceneModule.CityScene`
 * makes webpack warn "'CityScene' is not exported from '@/scene'" on every
 * build until 3D lands one, which is true, expected, and looks like an error
 * in a Vercel log. The computed access says the same thing to the reader
 * without shouting it at the whole team.
 */
const EXPORT_NAME = 'CityScene'
const provided = (sceneModule as Record<string, unknown>)[EXPORT_NAME]

/** True while the city is Product's flat outlines rather than 3D's scene. */
export const isFallbackScene = typeof provided !== 'function'

export const CityScene = (isFallbackScene ? FlatCityScene : provided) as ComponentType<CitySceneProps>

export type { CitySceneProps, CityPayload, Placement } from './types'
export default CityScene
