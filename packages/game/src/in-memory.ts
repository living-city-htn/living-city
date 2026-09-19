import {
  POINTS,
  inventoryRow,
  type Placement,
  pointsLedgerEntry,
  type ShopItem,
} from '@living-city/contracts'

type InventoryRow = ReturnType<typeof inventoryRow.parse>
type PointsLedgerEntry = ReturnType<typeof pointsLedgerEntry.parse>

export type CreditReason = keyof typeof POINTS

export type LikeablePost = {
  id: string
  user_id: string
}

export type GameOptions = {
  catalog?: readonly ShopItem[]
  now?: () => string
}

export const FALLBACK_CATALOG: readonly ShopItem[] = [
  { item_tag: 'benches', price: 10, category: 'decoration', taxonomy_version: 'fallback-v1' },
  { item_tag: 'bike_racks', price: 15, category: 'decoration', taxonomy_version: 'fallback-v1' },
  { item_tag: 'planters', price: 15, category: 'vegetation', taxonomy_version: 'fallback-v1' },
  { item_tag: 'outdoor_seating', price: 20, category: 'decoration', taxonomy_version: 'fallback-v1' },
  { item_tag: 'string_lights', price: 20, category: 'decoration', taxonomy_version: 'fallback-v1' },
  { item_tag: 'mural', price: 25, category: 'decoration', taxonomy_version: 'fallback-v1' },
]

const copy = <T>(value: T): T => ({ ...value })

/**
 * Temporary persistence for Stage 1 while the Pipeline-owned database
 * migrations are unavailable. It preserves the function boundaries that the
 * database implementation will keep.
 */
export const createInMemoryGame = (options: GameOptions = {}) => {
  const catalog = [...(options.catalog ?? FALLBACK_CATALOG)].map(copy)
  const now = options.now ?? (() => new Date().toISOString())
  const ledger: PointsLedgerEntry[] = []
  const creditedRefs = new Map<string, PointsLedgerEntry>()
  const inventories = new Map<string, Map<string, number>>()
  const placements: Placement[] = []
  const likes = new Set<string>()
  let sequence = 0

  const nextId = (prefix: string) => {
    sequence += 1
    return `${prefix}-${sequence}`
  }

  const appendLedger = (userId: string, delta: number, reason: string, refId: string | null) => {
    const entry: PointsLedgerEntry = {
      id: nextId('ledger'),
      user_id: userId,
      delta,
      reason,
      ref_id: refId,
      created_at: now(),
    }
    ledger.push(entry)
    return entry
  }

  const inventory = (userId: string) => {
    const existing = inventories.get(userId)
    if (existing) return existing
    const created = new Map<string, number>()
    inventories.set(userId, created)
    return created
  }

  const changeInventory = (userId: string, itemTag: string, delta: number) => {
    const items = inventory(userId)
    const quantity = (items.get(itemTag) ?? 0) + delta
    if (quantity <= 0) items.delete(itemTag)
    else items.set(itemTag, quantity)
  }

  const balance = (userId: string) => ledger
    .filter((entry) => entry.user_id === userId)
    .reduce((total, entry) => total + entry.delta, 0)

  const credit = (userId: string, reason: CreditReason, refId: string | null) => {
    const key = refId ? `${userId}:${reason}:${refId}` : null
    const existing = key ? creditedRefs.get(key) : undefined
    if (existing) return existing
    const entry = appendLedger(userId, POINTS[reason], reason, refId)
    if (key) creditedRefs.set(key, entry)
    return entry
  }

  const inventoryFor = (userId: string): InventoryRow[] => [...inventory(userId)].map(
    ([item_tag, quantity]) => ({ user_id: userId, item_tag, quantity }),
  )

  const placementsFor = (userId: string) => placements
    .filter((placement) => placement.user_id === userId)
    .map(copy)

  const likeCount = (postId: string) => [...likes].filter((key) => key.endsWith(`:${postId}`)).length

  return {
    credit,
    balance,
    catalog: () => catalog.map(copy),
    ledgerFor: (userId: string) => ledger.filter((entry) => entry.user_id === userId).map(copy),
    inventoryFor,
    placementsFor,
    likeCount,

    buy: (userId: string, itemTag: string) => {
      const item = catalog.find((candidate) => candidate.item_tag === itemTag)
      if (!item) return { ok: false as const, reason: 'unknown item' }
      if (balance(userId) < item.price) return { ok: false as const, reason: 'insufficient balance' }
      appendLedger(userId, -item.price, 'purchase', nextId(`purchase-${itemTag}`))
      changeInventory(userId, itemTag, 1)
      return { ok: true as const, balance: balance(userId) }
    },

    toggleLike: (userId: string, post: LikeablePost) => {
      const key = `${userId}:${post.id}`
      if (post.user_id === userId) {
        return { ok: false as const, reason: 'cannot like own post', liked: false, likes: likeCount(post.id) }
      }
      if (likes.has(key)) {
        likes.delete(key)
        return { ok: true as const, liked: false, likes: likeCount(post.id) }
      }
      likes.add(key)
      const reference = `like:${post.id}:${userId}`
      credit(userId, 'like_given', reference)
      credit(post.user_id, 'like_received', reference)
      return { ok: true as const, liked: true, likes: likeCount(post.id) }
    },

    place: (userId: string, communityId: string, slotId: string, itemTag: string) => {
      if (!catalog.some((item) => item.item_tag === itemTag)) {
        return { ok: false as const, reason: 'unknown item' }
      }
      if ((inventory(userId).get(itemTag) ?? 0) < 1) {
        return { ok: false as const, reason: 'not in inventory' }
      }
      if (placements.some((placement) =>
        placement.user_id === userId
        && placement.community_id === communityId
        && placement.slot_id === slotId,
      )) {
        return { ok: false as const, reason: 'slot occupied' }
      }
      changeInventory(userId, itemTag, -1)
      const placement: Placement = {
        id: nextId('placement'),
        user_id: userId,
        community_id: communityId,
        slot_id: slotId,
        item_tag: itemTag,
        created_at: now(),
      }
      placements.push(placement)
      return { ok: true as const, placement: copy(placement) }
    },

    remove: (userId: string, placementId: string) => {
      const index = placements.findIndex(
        (placement) => placement.id === placementId && placement.user_id === userId,
      )
      if (index < 0) return { ok: false as const, reason: 'not found' }
      const [removed] = placements.splice(index, 1)
      if (!removed) return { ok: false as const, reason: 'not found' }
      changeInventory(userId, removed.item_tag, 1)
      return { ok: true as const }
    },
  }
}
