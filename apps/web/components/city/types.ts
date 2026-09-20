/**
 * The <CityScene> contract, transcribed from docs/roles/3d.md ("Outputs").
 *
 * 3D owns the component. Product owns this file only so that the SVG fallback
 * and every call site are typed against the same shape before their component
 * lands. When it lands, this stays: it is the seam both sides compile against.
 *
 * Do not add a prop here that is not in the 3D playbook. If a screen needs
 * something else, it belongs in Product's own state, not in the scene, because
 * "the scene never owns app state; it renders it" (docs/02 section 4.5).
 */
import type { CommunityGeo, CommunityPlan, DecorationSlot } from '@living-city/fixtures'

/** Exactly the body of `GET /api/city` (docs/02 section 8). */
export type CityPayload = {
  communities: CommunityGeo[]
  slots: DecorationSlot[]
  /**
   * `BlockLayout` from the Map owner (docs/02 section 4.1). Not landed at
   * Stage 0, and the fallback does not need it: it projects `polygon_block`
   * itself. Typed loose on purpose so adding it is not a contract change.
   */
  layout?: unknown
}

/** One personal-layer placement (docs/02 section 4.6). Private per user. */
export type Placement = {
  community_id: string
  slot_id: string
  item_tag: string
  /**
   * The row id, which `DELETE /api/me/placements/:id` needs. Optional because
   * the scene contract in docs/roles/3d.md is only the three fields above and
   * a scene must never need it; My City is what reads it.
   */
  id?: string
}

/**
 * A building the viewer described, as the scene needs it. Private layer: the
 * scene draws these in `mine` mode only, on a decoration slot, and they never
 * touch a plan or a block's geometry (AGENTS.md, "Respect the two layers").
 * Structural rather than imported so this seam does not depend on pipeline.
 */
export type SceneBuilding = {
  id: string
  community_id: string
  spec: {
    name: string
    kind: string
    height: string
    storeys: number
    palette: string
    mood: string
    identity_tags: string[]
    features: string[]
  }
}

export type CitySceneProps = {
  /** The viewer's own described buildings. Optional, so the flat fallback ignores it. */
  buildings?: SceneBuilding[]
  /** docs/roles/3d.md prop `city`. */
  city: CityPayload
  /** docs/roles/3d.md prop `plans`. Public layer, one accepted plan per block. */
  plans: CommunityPlan[]
  /** docs/roles/3d.md prop `placements`. The viewer's own, never anyone else's. */
  placements: Placement[]
  /** docs/roles/3d.md prop `mode`. DESIGN.md makes these two tabs, City and My City. */
  mode: 'public' | 'mine'
  /** docs/roles/3d.md prop `selectedId`. One at a time (docs/02 section 4.5). */
  selectedId: string | null
  /** docs/roles/3d.md prop `planningIds`. Blocks awaiting a new plan (docs/04 section 7). */
  planningIds: string[]

  /**
   * Events from docs/roles/3d.md, named the React way (`onX`). The playbook
   * writes them bare (`blockHover(id)`); if 3D ships the bare names, the
   * adapter goes in ./index.ts and nothing else changes.
   */
  onBlockHover?: (id: string | null) => void
  onBlockSelect?: (id: string | null) => void
  /**
   * `point` is `[lon, lat]`, NOT scene or screen space.
   *
   * PRD 8.12 makes a block tap the location fallback while composing a post, so
   * the payload has to be something `POST /api/posts` accepts. Each
   * implementation inverts its own projection; no projection leaks out here.
   */
  onBlockPick?: (id: string, point: [number, number]) => void
  onSlotTap?: (communityId: string, slotId: string) => void

  /**
   * Which block is being rehearsed on, or null. Not in the 3D playbook — it
   * arrived with the City Hall drill, which kept the fact inside the scene.
   *
   * It is here because it is app state, and this file says where app state
   * lives: "the scene never owns app state; it renders it" (docs/02 section
   * 4.5). While it sat in the scene nothing outside could see it, so the block
   * being drilled went on showing what it posts on an ordinary day.
   *
   * The id travels rather than a boolean so the shell never has to name the
   * scene's block itself: the scene owns which one it drills, and importing
   * that from the shell would tie it to a scene it is built to work without.
   * Optional, so the flat fallback compiles against this untouched.
   *
   * Read-only, and there is no `onDrillChange` beside it. Starting and stopping
   * belongs to the operator panel, on its own route: the control used to float
   * over the city, which put an operator button in front of the judges and
   * covered the block it was talking about. The value reaches the shell on the
   * version poll.
   */
  drillCommunityId?: string | null
  /**
   * Bumped to bring the camera back to the selected block. Selecting the block
   * that is already selected changes nothing the scene can see, so a "View on
   * map" after the viewer has orbited away had no way to ask. Also app state
   * rather than scene state, for the same reason as the drill above.
   */
  focusTick?: number
}
