'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShopItem } from '@living-city/fixtures'
import { loadShop, purchaseItem, type ShopSnapshot } from '@/lib/shop'
import ItemDrawing from './ItemDrawing'

export default function ShopPanel({ active, onBalanceChanged }: {
  active: boolean
  onBalanceChanged: (balance: number) => void
}) {
  const [shop, setShop] = useState<ShopSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const purchaseInFlight = useRef(false)
  const loadVersion = useRef(0)

  const refresh = useCallback(async () => {
    if (purchaseInFlight.current) return
    const version = ++loadVersion.current
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const snapshot = await loadShop()
      if (version !== loadVersion.current) return
      setShop(snapshot)
      setNeedsRefresh(false)
      onBalanceChanged(snapshot.balance)
    } catch {
      if (version !== loadVersion.current) return
      setNeedsRefresh(true)
      setError('Could not load your shop and balance. Check your connection and try again.')
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [onBalanceChanged])

  useEffect(() => {
    if (active) void refresh()
    return () => { loadVersion.current++ }
  }, [active, refresh])

  const purchase = async (item: ShopItem) => {
    if (!shop || loading || needsRefresh || purchaseInFlight.current || shop.balance < item.price) return
    purchaseInFlight.current = true
    setBuying(item.item_tag)
    setError('')
    setMessage('')
    try {
      const result = await purchaseItem(item.item_tag)
      // The current API confirms one purchased unit and returns the actual balance.
      // Reopening the shop reloads authoritative inventory from /api/me.
      setShop({ ...shop, balance: result.balance,
        inventory: { ...shop.inventory, [item.item_tag]: (shop.inventory[item.item_tag] ?? 0) + 1 } })
      onBalanceChanged(result.balance)
      setMessage(`${item.label} added to your collection.`)
    } catch (failure) {
      setNeedsRefresh(true)
      setError(failure instanceof Error ? failure.message : 'Could not confirm your purchase. Refresh before buying again.')
    } finally {
      purchaseInFlight.current = false
      setBuying(null)
    }
  }

  return (
    <section className="sheet shop-sheet" aria-label="Shop" style={!active ? { display: 'none' } : undefined}>
      <header className="sheet-head">
        <div><h2>Make it yours</h2><p className="sheet-sub">Small touches for your personal city.</p></div>
        {shop && <span className="balance" aria-label={`${shop.balance} points available`}>{shop.balance} pts</span>}
      </header>
      <div className="sheet-body shop-body" aria-busy={loading}>
        {loading && <p className="muted" role="status">Loading your shop…</p>}
        {error && <div className="shop-feedback"><p role="alert">{error}</p>
          <button className="form-button" disabled={loading || buying !== null} onClick={() => void refresh()}>Refresh shop</button></div>}
        {message && <p className="shop-feedback" role="status">{message}</p>}
        {!loading && shop && <>
          <p className="shop-explainer">Earn points by posting and liking. Owned items stay here until you place them.</p>
          {shop.items.length === 0 ? <p className="muted">No decorations are available yet. Check back soon.</p> :
            <ul className="shop-grid">
              {shop.items.map(item => {
                const owned = shop.inventory[item.item_tag] ?? 0
                const shortfall = Math.max(0, item.price - shop.balance)
                return <li className="shop-item" key={item.item_tag}>
                  <div className="shop-item-top"><ItemDrawing tag={item.item_tag} /><span className="shop-owned">{owned} owned</span></div>
                  <h3>{item.label}</h3>
                  <p className="shop-price">{item.price} pts</p>
                  <button className="shop-buy" disabled={buying !== null || needsRefresh || shortfall > 0}
                    aria-label={`Buy ${item.label} for ${item.price} points`} onClick={() => void purchase(item)}>
                    {buying === item.item_tag ? 'Buying…' : shortfall > 0 ? `Need ${shortfall} more pts` : 'Buy'}
                  </button>
                </li>
              })}
            </ul>}
        </>}
      </div>
    </section>
  )
}
