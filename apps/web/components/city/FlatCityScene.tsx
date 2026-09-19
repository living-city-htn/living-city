'use client'

/**
 * Product's fallback for 3D's <CityScene>, per the Product contract in
 * docs/roles/product.md: "A flat SVG of the block polygons with the same props
 * and events". It satisfies the Gate 0 criterion "the hand-drawn city renders
 * as flat outlines in the stub app" and nothing more.
 *
 * It is disposable. When 3D exports `CityScene` from apps/web/scene, ./index.ts
 * picks theirs up and this file can be deleted without touching a call site.
 *
 * Deliberately NOT here: rotate, orbit, zoom, pan, camera framing, anything that
 * fakes 3D. Those are 3D's Gate 1 items (docs/roles/3d.md) and building them in
 * SVG would be throwaway work on a component designed to be thrown away.
 *
 * Look: near-monochrome, per the one art rule in apps/web/DESIGN.md. The colour
 * belongs to the city, and the city's real colour is 3D's to set.
 */
import { useMemo, useState } from 'react'
import type { CitySceneProps } from './types'
import { buildProjection, projectBlock } from './project'

/** Muted stand-ins for the plan's palette enum (docs/03 section 5.3). Not material sets. */
const PALETTE: Record<string, string> = {
  warm_pastel: 'var(--block-warm)',
  brick_red: 'var(--block-brick)',
  cool_pastel: 'var(--block-cool)',
  earthy_green: 'var(--block-green)',
  soft_grey: 'var(--block-neutral)',
}

const CSS = `
.lc-scene { --ink: #1c1c1e; --hair: #d8d8dc; --paper: #fbfbfd; --label: #6e6e73;
  --block-warm: #f0e3d6; --block-brick: #ecd9d4; --block-cool: #dde5ee;
  --block-green: #dde8dc; --block-neutral: #e8e8ec; --mark: #2f6fdd;
  width: 100%; height: 100%; display: block; background: var(--paper);
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
@media (prefers-color-scheme: dark) {
  .lc-scene { --ink: #f2f2f7; --hair: #3a3a3e; --paper: #0d0d0f; --label: #98989f;
    --block-warm: #3a3229; --block-brick: #3a2c29; --block-cool: #26303c;
    --block-green: #28332a; --block-neutral: #2a2a2e; --mark: #6ea0f5; }
}
.lc-block { fill: var(--block-neutral); stroke: var(--ink); stroke-width: 2;
  stroke-linejoin: round; cursor: pointer; transition: opacity 200ms ease, stroke-width 200ms ease; }
.lc-block[data-state="hovered"] { stroke-width: 4; }
.lc-block[data-state="selected"] { stroke-width: 5; }
.lc-block[data-dim="true"] { opacity: .45; }
.lc-planning { fill: none; stroke: var(--mark); stroke-width: 3; stroke-dasharray: 10 8;
  pointer-events: none; animation: lc-march 1s linear infinite; }
@keyframes lc-march { to { stroke-dashoffset: -18; } }
.lc-label { fill: var(--label); font: 500 15px -apple-system, system-ui, sans-serif;
  text-anchor: middle; pointer-events: none; user-select: none; }
.lc-slot { fill: none; stroke: var(--label); stroke-width: 2; stroke-dasharray: 3 3; cursor: pointer;
  /* The whole marker is the target, not its outline (PRD 8.12). */
  pointer-events: all; }
.lc-slot[data-filled="true"] { fill: var(--ink); stroke: none; stroke-dasharray: none; }
.lc-slot-label { fill: var(--label); font: 500 11px -apple-system, system-ui, sans-serif;
  text-anchor: middle; pointer-events: none; user-select: none; }
`

export default function FlatCityScene({
  city,
  plans,
  placements,
  mode,
  selectedId,
  planningIds,
  onBlockHover,
  onBlockSelect,
  onBlockPick,
  onSlotTap,
}: CitySceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const projection = useMemo(() => buildProjection(city.communities), [city.communities])
  const blocks = useMemo(
    () => city.communities.map((c) => ({ community: c, geom: projectBlock(c, projection) })),
    [city.communities, projection],
  )
  const planFor = useMemo(
    () => new Map(plans.map((p) => [p.community_id, p])),
    [plans],
  )
  /** Personal layer only; in public mode it is never read (docs/01 section 8.7). */
  const placedIn = useMemo(
    () => new Map(placements.map((p) => [`${p.community_id}/${p.slot_id}`, p.item_tag])),
    [placements],
  )

  const hover = (id: string | null) => {
    setHoveredId(id)
    onBlockHover?.(id)
  }

  /** Invert the projection so `point` leaves here as [lon, lat]. See ./types.ts. */
  const pickPoint = (evt: React.MouseEvent<SVGElement>): [number, number] | null => {
    const svg = evt.currentTarget.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    const local = pt.matrixTransform(ctm.inverse())
    return projection.toLonLat(local.x, local.y)
  }

  return (
    <svg
      className="lc-scene"
      viewBox={`0 0 ${projection.width.toFixed(0)} ${projection.height.toFixed(0)}`}
      role="img"
      aria-label="Kitchener-Waterloo, one shape per community"
      /**
       * Tap empty space to deselect (docs/01 section 8.12). This sits on the
       * element, not on a background rect in user units: the viewBox is
       * letterboxed inside the element, so a rect would miss the margins.
       */
      onClick={() => onBlockSelect?.(null)}
    >
      <style>{CSS}</style>

      {blocks.map(({ community, geom }) => {
        const id = community.community_id
        const plan = planFor.get(id)
        const state = selectedId === id ? 'selected' : hoveredId === id ? 'hovered' : 'idle'
        return (
          <g key={id}>
            <path
              className="lc-block"
              d={geom.d}
              data-state={state}
              data-dim={selectedId !== null && selectedId !== id}
              style={{ fill: PALETTE[plan?.palette ?? ''] ?? 'var(--block-neutral)' }}
              onMouseEnter={() => hover(id)}
              onMouseLeave={() => hover(null)}
              onClick={(e) => {
                e.stopPropagation()
                onBlockSelect?.(id)
                const point = pickPoint(e)
                if (point) onBlockPick?.(id, point)
              }}
            >
              <title>{plan?.summary ?? community.name}</title>
            </path>

            {planningIds.includes(id) && <path className="lc-planning" d={geom.d} />}

            <text className="lc-label" x={geom.cx} y={geom.cy + 5}>
              {community.name}
            </text>
          </g>
        )
      })}

      {/* Personal layer. Public mode shows nothing here, which is moment 5. */}
      {mode === 'mine' &&
        blocks.map(({ community, geom }) =>
          city.slots
            .filter((s) => s.community_id === community.community_id)
            .map((slot) => {
              const x = geom.cx + slot.x * geom.halfW * 0.7
              const y = geom.cy - slot.y * geom.halfH * 0.7
              const item = placedIn.get(`${community.community_id}/${slot.slot_id}`)
              return (
                <g key={`${community.community_id}/${slot.slot_id}`}>
                  <circle
                    className="lc-slot"
                    cx={x}
                    cy={y}
                    r={12}
                    data-filled={Boolean(item)}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSlotTap?.(community.community_id, slot.slot_id)
                    }}
                  />
                  {item && (
                    <text className="lc-slot-label" x={x} y={y + 28}>
                      {item}
                    </text>
                  )}
                </g>
              )
            }),
        )}
    </svg>
  )
}
