import { describe, expect, it } from 'vitest'
import { createInMemoryGame } from '../src/index'

const clock = () => '2026-09-19T12:00:00.000Z'

describe('the in-memory game fallback', () => {
  it('keeps an append-only, idempotent points ledger', () => {
    const game = createInMemoryGame({ now: clock })

    game.credit('resident-1', 'post_with_photo', 'post-1')
    game.credit('resident-1', 'post_with_photo', 'post-1')

    expect(game.balance('resident-1')).toBe(20)
    expect(game.ledgerFor('resident-1')).toMatchObject([
      { user_id: 'resident-1', delta: 20, reason: 'post_with_photo', ref_id: 'post-1' },
    ])
  })

  it('debits a purchase and adds the matching catalog item to private inventory', () => {
    const game = createInMemoryGame({ now: clock })
    const item = game.catalog()[0]
    if (!item) throw new Error('The fallback catalog must contain an item')
    game.credit('resident-1', 'post_with_photo', 'post-1')

    expect(game.buy('resident-1', item.item_tag)).toMatchObject({ ok: true })
    expect(game.balance('resident-1')).toBe(20 - item.price)
    expect(game.inventoryFor('resident-1')).toEqual([
      { user_id: 'resident-1', item_tag: item.item_tag, quantity: 1 },
    ])
  })

  it('credits each side of a like only once, even when it is toggled back on', () => {
    const game = createInMemoryGame({ now: clock })
    const post = { id: 'post-1', user_id: 'resident-2' }

    expect(game.toggleLike('resident-1', post)).toMatchObject({ liked: true, likes: 1 })
    expect(game.toggleLike('resident-1', post)).toMatchObject({ liked: false, likes: 0 })
    expect(game.toggleLike('resident-1', post)).toMatchObject({ liked: true, likes: 1 })

    expect(game.balance('resident-1')).toBe(1)
    expect(game.balance('resident-2')).toBe(2)
  })

  it('keeps a placement private, consumes inventory, and returns the item on removal', () => {
    const game = createInMemoryGame({ now: clock })
    const item = game.catalog()[0]
    if (!item) throw new Error('The fallback catalog must contain an item')
    game.credit('resident-1', 'post_with_photo', 'post-1')
    game.buy('resident-1', item.item_tag)

    const placed = game.place('resident-1', 'kw:victoria-park', 'plaza', item.item_tag)
    if (!placed.ok) throw new Error(placed.reason)
    expect(game.placementsFor('resident-1')).toEqual([placed.placement])
    expect(game.placementsFor('resident-2')).toEqual([])
    expect(game.inventoryFor('resident-1')).toEqual([])

    expect(game.remove('resident-1', placed.placement.id)).toEqual({ ok: true })
    expect(game.inventoryFor('resident-1')).toEqual([
      { user_id: 'resident-1', item_tag: item.item_tag, quantity: 1 },
    ])
  })
})
