'use client'

/**
 * Demo moment 5, second half: "place it on the block in my city. Switch to
 * public view: it is gone."
 *
 * Pick an owned item here, then tap a slot on any block. Tapping a filled slot
 * takes the item back. The sheet is the inventory and the instructions; the
 * slots themselves live on the map, because PRD 8.12 wants the touch target to
 * be the slot marker, not a control in a list.
 *
 * Nothing on this screen can change a public plan or a block's geometry
 * (AGENTS.md, "Respect the two layers").
 */
import { useEffect, useRef } from 'react'
import type { ShopItem } from '@living-city/fixtures'
import type { MyCitySnapshot } from '@/lib/placement'
import ItemDrawing from './ItemDrawing'

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
}: {
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
      if (entry) onHeight(entry.contentRect.height)
    })
    observer.observe(node)
    onHeight(node.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [active, onHeight])

  const label = (tag: string) =>
    catalog.find((i) => i.item_tag === tag)?.label ?? tag.replace(/_/g, ' ')

  const owned = snapshot
    ? Object.entries(snapshot.inventory).filter(([, qty]) => qty > 0)
    : []
  const placed = snapshot?.placements.length ?? 0

  return (
    <section ref={ref} className="sheet mycity-sheet" aria-label="My City" style={!active ? { display: 'none' } : undefined}>
      <header className="sheet-head">
        <div>
          <h2>My City</h2>
          <p className="sheet-sub">
            {placed === 0
              ? 'Only you can see what you place here.'
              : `${placed} ${placed === 1 ? 'decoration' : 'decorations'} placed — only you can see them.`}
          </p>
        </div>
        {snapshot && <span className="balance">{snapshot.balance} pts</span>}
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
          <p className="muted" role="status">Loading your city…</p>
        ) : owned.length === 0 ? (
          <p className="muted">
            {placed > 0
              ? 'Everything you own is placed. Tap a filled slot on a block to take it back.'
              : 'Nothing to place yet. Earn points by posting and liking, then buy something in the Shop.'}
          </p>
        ) : (
          <>
            <p className="shop-explainer">
              {selectedTag
                ? `Tap an empty slot on a block to place your ${label(selectedTag).toLowerCase()}.`
                : 'Pick an item, then tap an empty slot on a block.'}
            </p>
            <ul className="tray" role="listbox" aria-label="Your items">
              {owned.map(([tag, qty]) => (
                <li key={tag}>
                  <button
                    className="tray-item"
                    role="option"
                    aria-selected={selectedTag === tag}
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

        {placed > 0 && (
          <p className="muted mycity-hint">Tap a filled slot to take that item back.</p>
        )}
      </div>
    </section>
  )
}
