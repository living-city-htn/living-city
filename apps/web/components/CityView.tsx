'use client'

/**
 * The Gate 0 host for the city: fetches the stub API and holds the state the
 * scene renders. Everything here is Product's; the scene is swapped behind
 * ./city, so this file is identical whether 3D's component has landed or not.
 *
 * Stage 1 replaces the strip below with the five-tab bar and the block panel
 * from apps/web/DESIGN.md. It exists now only to prove the props and events in
 * components/city/types.ts actually flow.
 */
import { useEffect, useState } from 'react'
import type { CommunityPlan } from '@living-city/fixtures'
import { CityScene, isFallbackScene, type CityPayload, type Placement } from './city'

export default function CityView() {
  const [city, setCity] = useState<CityPayload | null>(null)
  const [plans, setPlans] = useState<CommunityPlan[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])
  const [mode, setMode] = useState<'public' | 'mine'>('public')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const payload: CityPayload = await fetch('/api/city').then((r) => r.json())
      if (!live) return
      setCity(payload)

      // No bulk plan route in docs/02 section 8; the scene wants them all at once.
      const fetched = await Promise.all(
        payload.communities.map((c) =>
          fetch(`/api/communities/${encodeURIComponent(c.community_id)}/plan`)
            .then((r) => (r.ok ? r.json() : null))
            .then((b) => b?.plan as CommunityPlan | undefined)
            .catch(() => undefined),
        ),
      )
      if (!live) return
      setPlans(fetched.filter(Boolean) as CommunityPlan[])

      const mine = await fetch('/api/me/placements').then((r) => r.json())
      if (live) setPlacements(mine.placements ?? [])
    })()
    return () => {
      live = false
    }
  }, [])

  const selected = city?.communities.find((c) => c.community_id === selectedId)

  return (
    <div className="lc-city">
      <style>{CSS}</style>

      <div className="lc-viewport">
        {city && (
          <CityScene
            city={city}
            plans={plans}
            placements={placements}
            mode={mode}
            selectedId={selectedId}
            planningIds={[]}
            onBlockSelect={setSelectedId}
            onBlockPick={(_id, point) =>
              setLastEvent(`picked ${point[0].toFixed(4)}, ${point[1].toFixed(4)}`)
            }
            onSlotTap={(communityId, slotId) => setLastEvent(`slotTap ${communityId} ${slotId}`)}
          />
        )}
      </div>

      <div className="lc-strip">
        <div className="lc-read">
          <strong>{selected?.name ?? 'Kitchener-Waterloo'}</strong>
          <span>
            {selected
              ? plans.find((p) => p.community_id === selected.community_id)?.summary ??
                'No plan yet.'
              : `${city?.communities.length ?? 0} communities`}
          </span>
          {lastEvent && <span className="lc-dim">{lastEvent}</span>}
          {isFallbackScene && <span className="lc-dim">flat outlines — 3D scene not landed</span>}
        </div>
        <button
          className="lc-switch"
          onClick={() => setMode((m) => (m === 'public' ? 'mine' : 'public'))}
        >
          {mode === 'public' ? 'City' : 'My City'}
        </button>
      </div>
    </div>
  )
}

const CSS = `
.lc-city { --ink: #1c1c1e; --label: #6e6e73; --paper: #fbfbfd; --hair: #d8d8dc;
  position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--paper);
  color: var(--ink); font: 400 15px/1.4 -apple-system, system-ui, sans-serif; }
@media (prefers-color-scheme: dark) {
  .lc-city { --ink: #f2f2f7; --label: #98989f; --paper: #0d0d0f; --hair: #3a3a3e; }
}
.lc-viewport { flex: 1; min-height: 0; }
.lc-strip { display: flex; align-items: center; gap: 16px; padding: 16px 24px;
  border-top: 1px solid var(--hair); backdrop-filter: blur(20px); }
.lc-read { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lc-read span { color: var(--label); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-dim { opacity: .7; }
.lc-switch { margin-left: auto; border: 1px solid var(--hair); background: transparent;
  color: var(--ink); border-radius: 12px; padding: 8px 16px; font: inherit; font-size: 14px;
  cursor: pointer; transition: background 200ms ease; }
.lc-switch:hover { background: var(--hair); }
`
