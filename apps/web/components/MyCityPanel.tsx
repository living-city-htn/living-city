'use client'

/**
 * Demo moment 5, second half: "place it on the block in my city. Switch to
 * public view: it is gone."
 *
 * Pick an owned item and a community, then place it using a map slot or its
 * equivalent touch-sized control. Filled slots return the item to inventory.
 *
 * Nothing on this screen can change a public plan or a block's geometry
 * (AGENTS.md, "Respect the two layers").
 */
import { useEffect, useRef } from 'react'
import type { ShopItem, DecorationSlot } from '@living-city/fixtures'
import type { MyCitySnapshot } from '@/lib/placement'
import ItemDrawing from './ItemDrawing'
import './city-controls.css'

export default function MyCityPanel({
  active,
  snapshot,
  catalog,
  selectedTag,
  onSelect,
  busy,
  error,
  message,
  onRefresh,
  needsRefresh,
  onHeight,
  onBrowseShop,
  selectedName,
  slots = [],
  onSlotTap,
}: {
  onBrowseShop?: () => void
  selectedName?: string
  slots?: DecorationSlot[]
  onSlotTap?: (communityId: string, slotId: string) => void
  active: boolean
  snapshot: MyCitySnapshot | null
  catalog: ShopItem[]
  selectedTag: string | null
  onSelect: (tag: string | null) => void
  busy: boolean
  error: string
  message: string
  onRefresh: () => void
  needsRefresh: boolean
  /** Reports the sheet's height so the map can keep every slot above it. */
  onHeight: (px: number) => void
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!active) {
      onHeight(0)
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onHeight(node.getBoundingClientRect().height)
    })
    observer.observe(node)
    onHeight(node.getBoundingClientRect().height)
    return () => { observer.disconnect(); onHeight(0) }
  }, [active, onHeight])

  const label = (tag: string) =>
    catalog.find((i) => i.item_tag === tag)?.label ?? tag.replace(/_/g, ' ')

  const owned = snapshot
    ? Object.entries(snapshot.inventory).filter(([, qty]) => qty > 0)
    : []
  const placed = snapshot?.placements.length ?? 0

  return (
    <section ref={ref} className="inventory-panel" aria-label="My City" style={!active ? { display: 'none' } : undefined}>
      <header className="sheet-head">
        <div>
          <h2>Your decorations</h2>
          <p className="sheet-sub">
            {placed === 0
              ? 'Only you can see what you place here.'
              : `${placed} ${placed === 1 ? 'decoration' : 'decorations'} placed — only you can see them.`}
          </p>
        </div>
      </header>

      <div className="sheet-body" aria-busy={busy}>
        {error && (
          <div className="shop-feedback">
            <p role="alert">{error}</p>
            <button className="form-button" disabled={busy} onClick={onRefresh}>
              Refresh my city
            </button>
          </div>
        )}
        {message && !error && <p className="shop-feedback" role="status">{message}</p>}

        {!snapshot ? (
          !error && <p className="muted" role="status">Loading your city…</p>
        ) : owned.length === 0 ? (
          <div className="inventory-empty"><p className="muted">
            {placed > 0
              ? 'All your items are placed.'
              : 'Earn points by sharing, then choose your first decoration.'}
          </p>{onBrowseShop && <button className="form-button inventory-shop" onClick={onBrowseShop}>Browse shop</button>}</div>
        ) : (
          <>
            <p className="shop-explainer">
              {selectedTag
                ? `Place your ${label(selectedTag).toLowerCase()} in an empty slot.`
                : 'Pick an item, then an empty slot.'}
            </p>
            <ul className="tray" aria-label="Your items">
              {owned.map(([tag, qty]) => (
                <li key={tag}>
                  <button
                    className="tray-item"
                    aria-pressed={selectedTag === tag}
                    data-selected={selectedTag === tag}
                    disabled={busy || needsRefresh}
                    onClick={() => onSelect(selectedTag === tag ? null : tag)}
                  >
                    <ItemDrawing tag={tag} size={36} />
                    <span className="tray-label">{label(tag)}</span>
                    <span className="tray-qty">{qty}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {snapshot && <div className="placement-controls">
          <h3>{selectedName || 'Choose a community on the map'}</h3>
          {selectedName && slots.length > 0 && <div className="placement-slots" role="group" aria-label={`Decoration slots in ${selectedName}`}>
            {slots.map((slot, index) => {
              const item = snapshot.placements.find((p) => p.community_id === slot.community_id && p.slot_id === slot.slot_id)
              return <button key={slot.slot_id} className="placement-slot" disabled={busy || needsRefresh || (!item && !selectedTag)} onClick={() => onSlotTap?.(slot.community_id, slot.slot_id)} aria-label={item ? `Take back ${label(item.item_tag)} from slot ${index + 1}` : `Place ${selectedTag ? label(selectedTag) : 'item'} in slot ${index + 1}`}>
                <span>Slot {index + 1}</span><strong>{item ? label(item.item_tag) : 'Empty'}</strong><small>{item ? 'Take back' : selectedTag ? 'Place here' : 'Select an item'}</small>
              </button>
            })}
          </div>}
          {busy && <p role="status">Saving your decoration…</p>}
        </div>}
      </div>
    </section>
  )
}
