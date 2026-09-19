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

export type CitySceneProps = {
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
}
