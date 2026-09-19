/**
 * In-memory store behind the stub API (USE_FIXTURES=1).
 *
 * This is deliberately not a database. It exists so the phone flow, the panel,
 * the shop and the government page can be built and rehearsed before Pipeline's
 * migrations and Civic's game CRUD land, and so the operator panel's reset
 * button has something to reset. Every function here is replaced by the real
 * owner's implementation in Stage 2; keep the signatures, swap the body.
 *
 * State is durable when DATABASE_URL is set: `read` and `write` below carry the
 * whole state to and from one JSONB row, so every serverless instance sees the
 * same city. Without a database it stays in module memory, which is fine for
 * local development and is why the reset route exists.
 *
 * Every mutating route must go through `write`. Reading `state` directly outside
 * `read`/`write` will see whatever this instance happened to load last.
 */
import { durable, load, overwrite, save, type Serialized } from './persist'
import {
  DEMO_COMMUNITY_ID, communities, fallbackPlans, presetFestivalPlan,
  seedPosts, seedUsers, shopItems, slots,
  type CommunityPlan, type SeedPost, type SeedUser,
} from './index'

export type Incident = {
  id: string
  post_id: string
  community_id: string
  type: string
  severity: 0 | 1 | 2 | 3
  location_hint: string | null
  reported_at: string
  source: string
  status: 'reported' | 'verified'
  staff_note: string | null
  updated_at: string
}

type State = {
  posts: SeedPost[]
  users: SeedUser[]
  likes: Set<string>                                  // `${user_id}:${post_id}`
  balances: Map<string, number>
  inventory: Map<string, Map<string, number>>         // user -> item_tag -> qty
  placements: Array<{ id: string; user_id: string; community_id: string; slot_id: string; item_tag: string; created_at: string }>
  plans: Map<string, CommunityPlan>
  incidents: Incident[]
  updatedAt: string
  seq: number
  /** Whether the QR page is inviting new posts (operator control). */
  qrPaused: boolean
}

let state: State

/**
 * Incidents the stub derives from the seed posts. In the real system Call A
 * produces `PostAnalysis.incident` and Civic creates the row (docs/02 section 4.7);
 * here we read the flag the fixture already carries so moment 6 has rows to show.
 */
const seedIncidents = (posts: SeedPost[]): Incident[] =>
  posts
    .filter((p) => p.is_incident_report && !p.hidden)
    .map((p, i) => ({
      id: `inc-${String(i + 1).padStart(3, '0')}`,
      post_id: p.id,
      community_id: p.community_id,
      type: /tree|maple|branch/i.test(p.text) ? 'fallen_tree'
          : /water|pool|flood/i.test(p.text) ? 'flooding'
          : /light|power|dark/i.test(p.text) ? 'power_outage'
          : 'road_blocked',
      severity: 2,
      location_hint: null,
      reported_at: p.created_at,
      source: 'post',
      status: 'reported',
      staff_note: null,
      updated_at: p.created_at,
    }))

export function reset(): void {
  state = {
    posts: seedPosts.map((p) => ({ ...p })),
    users: seedUsers.map((u) => ({ ...u })),
    likes: new Set(),
    balances: new Map(seedUsers.map((u) => [u.id, u.balance])),
    inventory: new Map(),
    placements: [],
    plans: new Map(fallbackPlans.map((p) => [p.community_id, p])),
    incidents: seedIncidents(seedPosts),
    updatedAt: new Date().toISOString(),
    seq: seedPosts.length,
    qrPaused: false,
  }
}
reset()

/* --- durability ---------------------------------------------------------- */

const serialize = (s: State): Serialized => ({
  posts: s.posts, users: s.users,
  likes: [...s.likes],
  balances: [...s.balances],
  inventory: [...s.inventory].map(([user, items]) => [user, [...items]] as [string, Array<[string, number]>]),
  placements: s.placements,
  plans: [...s.plans],
  incidents: s.incidents,
  updatedAt: s.updatedAt, seq: s.seq, qrPaused: s.qrPaused,
})

const deserialize = (d: Serialized): State => ({
  posts: d.posts as SeedPost[],
  users: d.users as SeedUser[],
  likes: new Set(d.likes),
  balances: new Map(d.balances),
  inventory: new Map(d.inventory.map(([user, items]) => [user, new Map(items)])),
  placements: d.placements as State['placements'],
  plans: new Map(d.plans as Array<[string, CommunityPlan]>),
  incidents: d.incidents as Incident[],
  updatedAt: d.updatedAt, seq: d.seq, qrPaused: d.qrPaused,
})

let version = 0

async function hydrate(): Promise<void> {
  const row = await load()
  if (row) {
    state = deserialize(row.data)
    version = row.version
    return
  }
  // First request against an empty database: seed it.
  reset()
  await overwrite(serialize(state))
  version = 1
}

/** Read the shared state, then answer from it. */
export async function read<T>(fn: () => T): Promise<T> {
  if (durable()) await hydrate()
  return fn()
}

/**
 * Mutate the shared state. The mutation re-runs against a fresh read if someone
 * else wrote first, which is what two judges posting at once looks like.
 */
export async function write<T>(fn: () => T): Promise<T> {
  if (!durable()) return fn()
  for (let attempt = 0; attempt < 4; attempt++) {
    await hydrate()
    const result = fn()
    if (await save(serialize(state), version)) return result
  }
  throw new Error('Could not save: the city is being written to to too quickly.')
}

/** The operator's reset wins outright rather than retrying. */
export async function resetDurable(): Promise<void> {
  reset()
  if (durable()) await overwrite(serialize(state))
}

const touch = () => { state.updatedAt = new Date().toISOString() }

export const getState = () => state
export const listCommunities = () => communities
export const listSlots = (communityId?: string) =>
  communityId ? slots.filter((s) => s.community_id === communityId) : slots
export const listShop = () => shopItems

export const listPosts = (opts: { community?: string; includeHidden?: boolean } = {}) =>
  state.posts.filter(
    (p) =>
      (opts.includeHidden || (!p.hidden && p.status === 'analyzed')) &&
      (!opts.community || p.community_id === opts.community),
  )

export function createPost(input: {
  user_id: string; text: string; image_url?: string | null
  lon: number; lat: number; community_id: string; is_incident_report?: boolean
}): SeedPost {
  state.seq += 1
  const post: SeedPost = {
    id: `p-${String(state.seq).padStart(3, '0')}`,
    user_id: input.user_id,
    text: input.text,
    image_url: input.image_url ?? null,
    lon: input.lon,
    lat: input.lat,
    created_at: new Date().toISOString(),
    community_id: input.community_id,
    is_incident_report: input.is_incident_report ?? false,
    // The real pipeline holds a post at "pending" until Call A returns
    // (docs/04 section 7). The stub analyses instantly; Product's UI must still
    // handle the pending state, so do not rely on this staying synchronous.
    status: 'analyzed',
    hidden: false,
    hidden_reason: null,
  }
  state.posts.unshift(post)
  credit(input.user_id, input.image_url ? 20 : 10)
  touch()
  return post
}

export function hidePost(postId: string, reason: 'auto' | 'operator'): SeedPost | null {
  const post = state.posts.find((p) => p.id === postId)
  if (!post) return null
  post.hidden = true
  post.hidden_reason = reason
  // Hiding a post removes its incident from the government page. docs/02 section 4.7.
  state.incidents = state.incidents.filter((inc) => inc.post_id !== postId)
  touch()
  return post
}

export const balance = (userId: string) => state.balances.get(userId) ?? 0
export function credit(userId: string, delta: number): number {
  const next = balance(userId) + delta
  state.balances.set(userId, next)
  return next
}

export function toggleLike(userId: string, postId: string): { liked: boolean; balance: number } {
  const key = `${userId}:${postId}`
  if (state.likes.has(key)) {
    state.likes.delete(key)
    return { liked: false, balance: balance(userId) }
  }
  state.likes.add(key)
  credit(userId, 1)                                   // like given: 1. docs/01 section 8.8.
  const post = state.posts.find((p) => p.id === postId)
  if (post) credit(post.user_id, 2)                   // like received: 2.
  return { liked: true, balance: balance(userId) }
}
export const likeCount = (postId: string) =>
  [...state.likes].filter((k) => k.endsWith(`:${postId}`)).length

export const inventoryOf = (userId: string) =>
  Object.fromEntries(state.inventory.get(userId) ?? new Map())

export function buy(userId: string, itemTag: string): { ok: boolean; reason?: string; balance: number } {
  const item = shopItems.find((s) => s.item_tag === itemTag)
  if (!item) return { ok: false, reason: 'unknown item', balance: balance(userId) }
  if (balance(userId) < item.price) return { ok: false, reason: 'insufficient balance', balance: balance(userId) }
  credit(userId, -item.price)
  const inv = state.inventory.get(userId) ?? new Map<string, number>()
  inv.set(itemTag, (inv.get(itemTag) ?? 0) + 1)
  state.inventory.set(userId, inv)
  return { ok: true, balance: balance(userId) }
}

export const placementsOf = (userId: string) => state.placements.filter((p) => p.user_id === userId)

export function place(userId: string, communityId: string, slotId: string, itemTag: string) {
  const inv = state.inventory.get(userId)
  if (!inv || (inv.get(itemTag) ?? 0) < 1) return { ok: false as const, reason: 'not in inventory' }
  inv.set(itemTag, (inv.get(itemTag) ?? 0) - 1)
  const placement = {
    id: `pl-${state.placements.length + 1}`,
    user_id: userId, community_id: communityId, slot_id: slotId, item_tag: itemTag,
    created_at: new Date().toISOString(),
  }
  state.placements.push(placement)
  return { ok: true as const, placement }
}

export function removePlacement(userId: string, placementId: string) {
  const idx = state.placements.findIndex((p) => p.id === placementId && p.user_id === userId)
  if (idx < 0) return { ok: false as const, reason: 'not found' }
  const [removed] = state.placements.splice(idx, 1)
  if (removed) {
    const inv = state.inventory.get(userId) ?? new Map<string, number>()
    inv.set(removed.item_tag, (inv.get(removed.item_tag) ?? 0) + 1)
    state.inventory.set(userId, inv)
  }
  return { ok: true as const }
}

export const planFor = (communityId: string) => state.plans.get(communityId) ?? null
export const allPlans = () => [...state.plans.values()]

/** Operator's preset festival plan for the demo block. docs/04 section 8. */
export function applyPresetFestival(): CommunityPlan {
  const plan = { ...presetFestivalPlan, plan_id: `${presetFestivalPlan.plan_id}:${Date.now()}` }
  state.plans.set(DEMO_COMMUNITY_ID, plan)
  touch()
  return plan
}

/**
 * Stand-in for a planning cycle. The real Call B lives in packages/pipeline and
 * this route is Pipeline's to implement; the stub only bumps the plan id so the
 * scene's version poll sees a change and rebuilds the block.
 */
export function replan(communityId: string): CommunityPlan | null {
  const current = state.plans.get(communityId)
  if (!current) return null
  const next = { ...current, plan_id: `${communityId}:${Date.now()}` }
  state.plans.set(communityId, next)
  touch()
  return next
}

/**
 * Whether the QR page is inviting new posts. Product's operator control, not a
 * docs/02 section 8 contract route.
 *
 * This is volume throttling for moment 8, not a safety fuse: the fuse for bad
 * content is hide-post, which is a database write. A cold process starts
 * unpaused, so the operator has to re-pause after a reset — the panel shows the
 * current state so that is visible rather than assumed.
 */
export const qrPaused = () => state.qrPaused
export function setQrPaused(paused: boolean): boolean {
  state.qrPaused = paused
  touch()
  return state.qrPaused
}

export const cityVersion = () => ({
  plans: Object.fromEntries([...state.plans].map(([id, p]) => [id, p.plan_id])),
  updated_at: state.updatedAt,
})

export const listIncidents = (f: { community?: string; type?: string; status?: string } = {}) =>
  state.incidents.filter(
    (i) =>
      (!f.community || i.community_id === f.community) &&
      (!f.type || i.type === f.type) &&
      (!f.status || i.status === f.status),
  )

export function verifyIncident(id: string, staffNote?: string) {
  const inc = state.incidents.find((i) => i.id === id)
  if (!inc) return null
  inc.status = 'verified'
  if (staffNote !== undefined) inc.staff_note = staffNote
  inc.updated_at = new Date().toISOString()
  // verified incident report: 25. docs/01 section 8.8.
  const post = state.posts.find((p) => p.id === inc.post_id)
  if (post) credit(post.user_id, 25)
  return inc
}
