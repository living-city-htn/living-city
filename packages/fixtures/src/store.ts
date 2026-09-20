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
import { eventCommunityFor, eventPlan } from './city-events'
import {
  DEMO_COMMUNITY_ID, VENUE_COMMUNITY_ID, communities, fallbackPlans, presetFestivalPlan,
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

/**
 * A building the user described and the model specified, standing on their
 * own map only.
 *
 * `spec` is deliberately opaque here. It is a `BuildingSpec` from
 * `@living-city/pipeline`, but this package is a dependency of that one, so
 * naming the type would close a cycle. The web seam validates it on the way
 * in and types it on the way out - the same trade `Incident` already makes by
 * widening `type` to string.
 */
export type UserBuilding = {
  id: string
  user_id: string
  community_id: string
  /** Null until the user puts it somewhere. A spec can exist unplaced. */
  slot_id: string | null
  name: string
  spec: unknown
  /** The photograph the user supplied, for the card in the panel. */
  image_url: string | null
  created_at: string
}

export type FixtureState = {
  posts: SeedPost[]
  users: SeedUser[]
  likes: Set<string>                                  // `${user_id}:${post_id}`
  /** Legacy persisted alias retained during the credit-ledger migration. */
  rewardedLikes: Set<string>
  likeCredits: Set<string>                            // one points credit per like pair
  likeCreditBlockedPostIds: Set<string>               // unreconstructable pre-migration history
  balances: Map<string, number>
  inventory: Map<string, Map<string, number>>         // user -> item_tag -> qty
  placements: Array<{ id: string; user_id: string; community_id: string; slot_id: string; item_tag: string; created_at: string }>
  /** AI-described buildings. Private, like placements: see `buildingsOf`. */
  buildings: UserBuilding[]
  plans: Map<string, CommunityPlan>
  incidents: Incident[]
  updatedAt: string
  seq: number
  /** Stamps of recent saves, so a retry can tell whether its write committed. */
  recentWrites: string[]
  /** Whether the QR page is inviting new posts (operator control). */
  qrPaused: boolean
}

let state: FixtureState

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

/**
 * Post ids are `p-NNN`, and `seq` is the highest number minted so far.
 *
 * It is the highest id in the seed rather than the number of posts, because the
 * seed's ids have gaps in them: narrowing the city to Waterloo dropped the
 * Kitchener posts and left their numbers behind. Counting instead of measuring
 * restarts the sequence underneath ids that already exist, and the first post
 * of the demo duplicates a seed post.
 */
const POST_ID = /^p-(\d+)$/
const highestPostSeq = (posts: SeedPost[]): number =>
  posts.reduce((max, p) => {
    const n = POST_ID.exec(p.id)
    return n ? Math.max(max, Number(n[1])) : max
  }, 0)

/**
 * The next free id. It steps over anything the state already holds, so a row
 * written by an older build - the shape this bug leaves behind - heals on the
 * next post instead of colliding a second time.
 */
function nextPostId(): string {
  const taken = new Set(state.posts.map((p) => p.id))
  let id: string
  do { id = `p-${String((state.seq += 1)).padStart(3, '0')}` } while (taken.has(id))
  return id
}

/**
 * Likes the seed posts arrive with.
 *
 * A feed where every post has zero likes reads as a fixture rather than a
 * neighbourhood, and the feed is the first thing a judge sees. These are
 * historical: they go straight into the set rather than through `credit`, so
 * the balances the seed authors stay the balances the seed authors.
 *
 * Deterministic, so two instances that both cold-start agree about the city and
 * a rehearsal looks the same every time. Each post gets an appeal, and each
 * resident likes it or not depending on how their own name falls against it.
 */
const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const seedLikes = (posts: SeedPost[], users: SeedUser[]): Set<string> => {
  // The government account reads the feed, it does not hand out hearts.
  const residents = users.filter((u) => u.role !== 'government')
  const likes = new Set<string>()
  for (const p of posts) {
    if (p.hidden) continue
    // 15 to 90: a quiet post still picks up one, a popular one gets most of them.
    const appeal = 15 + (hash(p.id) % 76)
    for (const u of residents) {
      if (u.id === p.user_id) continue                 // nobody likes their own post
      if (hash(`${u.id}:${p.id}`) % 100 < appeal) likes.add(`${u.id}:${p.id}`)
    }
  }
  return likes
}

export function reset(): void {
  const seeded = seedLikes(seedPosts, seedUsers)
  state = {
    posts: seedPosts.map((p) => ({ ...p })),
    users: seedUsers.map((u) => ({ ...u })),
    likes: seeded,
    // The seed's likes are history and paid out whenever they happened, so
    // nobody can unlike one and like it again to be paid for it now.
    rewardedLikes: new Set(seeded),
    likeCredits: new Set(seeded),
    likeCreditBlockedPostIds: new Set(),
    balances: new Map(seedUsers.map((u) => [u.id, u.balance])),
    inventory: new Map(),
    placements: [],
    buildings: [],
    plans: new Map(fallbackPlans.map((p) => [p.community_id, p])),
    incidents: seedIncidents(seedPosts),
    updatedAt: new Date().toISOString(),
    seq: highestPostSeq(seedPosts),
    recentWrites: [],
    qrPaused: false,
  }
}
reset()

/* --- durability ---------------------------------------------------------- */

const serialize = (s: FixtureState): Serialized => ({
  posts: s.posts, users: s.users,
  likes: [...s.likes],
  rewardedLikes: [...s.rewardedLikes],
  likeCredits: [...s.likeCredits],
  likeCreditBlockedPostIds: [...s.likeCreditBlockedPostIds],
  balances: [...s.balances],
  inventory: [...s.inventory].map(([user, items]) => [user, [...items]] as [string, Array<[string, number]>]),
  placements: s.placements,
  buildings: s.buildings,
  plans: [...s.plans],
  incidents: s.incidents,
  updatedAt: s.updatedAt, seq: s.seq, qrPaused: s.qrPaused, recentWrites: s.recentWrites,
})

const largestIdSuffix = (rows: unknown[], prefix: string): number => rows.reduce<number>((maximum, row) => {
  if (row === null || typeof row !== 'object') return maximum
  const id = (row as { id?: unknown }).id
  const match = typeof id === 'string' ? new RegExp(`^${prefix}-(\\d+)$`).exec(id) : null
  const suffix = match?.[1] ? Number(match[1]) : 0
  return Number.isSafeInteger(suffix) ? Math.max(maximum, suffix) : maximum
}, 0)

/**
 * Pure so migration behavior can be regression-tested without a database.
 * Routes must still use read/write rather than replacing the live state.
 */
export const deserializeState = (d: Serialized): FixtureState => {
  const posts = d.posts as SeedPost[]
  const placements = d.placements as FixtureState['placements']
  const persistedCredits = d.likeCredits ?? d.rewardedLikes
  const legacyCreditBlockedPostIds = d.likeCreditBlockedPostIds
    ?? (persistedCredits === undefined
      ? posts.map((post) => post.id)
      : [])
  const credits = new Set(persistedCredits ?? d.likes)

  return {
    posts,
    users: d.users as SeedUser[],
    likes: new Set(d.likes),
    // Keep the legacy field in sync while rows written before the rename are
    // still in circulation. Both names describe the same one-time ledger.
    rewardedLikes: new Set(credits),
    likeCredits: credits,
    // A legacy row cannot reveal which inactive likes were already rewarded.
    // Conservatively withhold a new reward for its existing posts; new posts
    // and a reset state retain normal one-time credits.
    likeCreditBlockedPostIds: new Set(legacyCreditBlockedPostIds),
    balances: new Map(d.balances),
    inventory: new Map(d.inventory.map(([user, items]) => [user, new Map(items)])),
    placements,
    // Rows written before private buildings were introduced remain readable;
    // an absent field is an empty list, not a crash.
    buildings: (d.buildings ?? []) as UserBuilding[],
    plans: new Map(d.plans as Array<[string, CommunityPlan]>),
    incidents: d.incidents as Incident[],
    updatedAt: d.updatedAt,
    // Heal existing durable rows that were written before post ids were made
    // collision-safe, while keeping placements on the shared sequence.
    seq: Math.max(d.seq, highestPostSeq(posts), largestIdSuffix(d.placements, 'pl')),
    // Rows written before retry stamps existed are still safe to load.
    recentWrites: d.recentWrites ?? [],
    qrPaused: d.qrPaused,
  }
}

let version = 0

async function hydrate(): Promise<void> {
  const row = await load()
  if (row) {
    state = deserializeState(row.data)
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
 * How many times a mutation is re-applied before `write` gives up.
 *
 * Every writer competes for one row version and exactly one wins per round, so
 * the Nth simultaneous writer needs N attempts. The budget used to be four,
 * which meant five judges posting in the same instant always produced a 500 -
 * and docs/04 section 7 expects tens of people in moment 8.
 */
const WRITE_ATTEMPTS = 16

/** Jittered, so writers that lost a round do not all retry in lockstep. */
const backoff = (attempt: number): Promise<void> =>
  new Promise((done) => setTimeout(done, Math.random() * 8 * Math.min(attempt, 8)))

/**
 * How many stamps the row remembers. A retry only has to outlast the writers
 * that slipped in while its own response was lost, so this is generous.
 */
const WRITE_LOG = 64

/** Marks a row as the product of one particular attempt. */
const newWriteId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Mutate the shared state. The mutation re-runs against a fresh read if someone
 * else wrote first, which is what two judges posting at once looks like.
 *
 * The re-run has to be safe, because a save can commit and still report failure:
 * a lost response on Neon's pooled connection is indistinguishable from a
 * rejected version check. Applying the mutation a second time then charges a
 * balance twice or writes two posts for one tap. So each attempt stamps the row
 * with its own id, and a retry that finds its predecessor's stamp already in
 * the row knows that write landed and returns rather than repeating it. The
 * stamps are a list because another writer can commit in between, and the stamp
 * has to survive their write to still be there when the retry looks.
 */
export async function write<T>(fn: () => T): Promise<T> {
  if (!durable()) return fn()
  let attempted: { id: string; result: T } | null = null
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (attempt > 0) await backoff(attempt)
    await hydrate()
    if (attempted && state.recentWrites.includes(attempted.id)) return attempted.result
    const result = fn()
    const id = newWriteId()
    state.recentWrites = [...state.recentWrites, id].slice(-WRITE_LOG)
    if (await save(serialize(state), version)) return result
    attempted = { id, result }
  }
  throw new Error('Could not save: the city is being written to too quickly.')
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

/**
 * Posts as they are on a normal day, or as they are during a rehearsal.
 *
 * Asking for a scenario replaces what that community is saying rather than
 * adding to it: during a tornado drill the block is not posting about patio
 * season and a storm at the same time. Everywhere else carries on as usual,
 * and because nothing is written, ending the rehearsal restores the ordinary
 * posts by itself.
 */
export const listPosts = (
  opts: { community?: string; includeHidden?: boolean; scenario?: 'drill' } = {},
) =>
  state.posts.filter((p) => {
    if (!opts.includeHidden && (p.hidden || p.status !== 'analyzed')) return false
    if (opts.community && p.community_id !== opts.community) return false
    return opts.scenario ? p.scenario === opts.scenario : !p.scenario
  })

export function createPost(input: {
  user_id: string; text: string; image_url?: string | null
  lon: number; lat: number; community_id: string; is_incident_report?: boolean
}): SeedPost {
  const post: SeedPost = {
    id: nextPostId(),
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

/**
 * Liking pays, unliking does not take it back, and liking the same post again
 * pays nothing.
 *
 * Points are for interacting, so the heart has to be worth tapping - but it
 * used to credit the like and debit nothing on the way out, which made it a
 * printer: tap, untap, tap again. Charging the unlike instead would stop the
 * printing and punish anyone who changed their mind, and a point already
 * earned should stay earned.
 *
 * So the payout is once per person per post, ever. That bounds what the heart
 * can ever be worth to the number of posts in the city rather than to how long
 * someone keeps tapping, which is the cap docs/01 section 8.8 asks for without
 * needing a clock to enforce it.
 */
export type ToggleLikeResult =
  | { ok: true; liked: boolean; balance: number }
  | { ok: false; reason: 'post not found' | 'cannot like own post' }

export function toggleLike(userId: string, postId: string): ToggleLikeResult {
  const post = state.posts.find((candidate) => candidate.id === postId)
  if (!post) return { ok: false, reason: 'post not found' }
  if (post.user_id === userId) return { ok: false, reason: 'cannot like own post' }

  const key = `${userId}:${postId}`
  if (state.likes.has(key)) {
    state.likes.delete(key)
    return { ok: true, liked: false, balance: balance(userId) }
  }
  state.likes.add(key)
  // Points are earned for the relationship, not for repeatedly flipping it.
  if (!state.likeCredits.has(key) && !state.likeCreditBlockedPostIds.has(postId)) {
    credit(userId, 1)                                 // like given: 1. docs/01 section 8.8.
    credit(post.user_id, 2)                           // like received: 2.
    state.likeCredits.add(key)
    state.rewardedLikes.add(key)
  }
  return { ok: true, liked: true, balance: balance(userId) }
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
  const slotExists = slots.some((slot) =>
    slot.community_id === communityId && slot.slot_id === slotId,
  )
  if (!slotExists) return { ok: false as const, reason: 'invalid slot' }
  if (state.placements.some((placement) =>
    placement.user_id === userId
    && placement.community_id === communityId
    && placement.slot_id === slotId,
  )) {
    return { ok: false as const, reason: 'slot occupied' }
  }
  const inv = state.inventory.get(userId)
  if (!inv || (inv.get(itemTag) ?? 0) < 1) return { ok: false as const, reason: 'not in inventory' }
  inv.set(itemTag, (inv.get(itemTag) ?? 0) - 1)
  state.seq += 1
  const placement = {
    id: `pl-${state.seq}`,
    user_id: userId, community_id: communityId, slot_id: slotId, item_tag: itemTag,
    created_at: new Date().toISOString(),
  }
  state.placements.push(placement)
  return { ok: true as const, placement }
}

/**
 * Private, exactly like `placementsOf`. No route returns another user's
 * buildings, and nothing here can reach a public plan or a block's geometry
 * (AGENTS.md, "Respect the two layers").
 */
export const buildingsOf = (userId: string): UserBuilding[] =>
  state.buildings.filter((b) => b.user_id === userId)

export function addBuilding(input: Omit<UserBuilding, 'id' | 'created_at'>) {
  const building: UserBuilding = {
    ...input,
    id: `bld-${state.buildings.length + 1}`,
    created_at: new Date().toISOString(),
  }
  state.buildings.push(building)
  return { ok: true as const, building }
}

/** Move one onto a slot, or off it with null. Owner only. */
export function placeBuilding(userId: string, id: string, slotId: string | null) {
  const building = state.buildings.find((b) => b.id === id && b.user_id === userId)
  if (!building) return { ok: false as const, reason: 'not found' }
  building.slot_id = slotId
  return { ok: true as const, building }
}

export function removeBuilding(userId: string, id: string) {
  const before = state.buildings.length
  state.buildings = state.buildings.filter((b) => !(b.id === id && b.user_id === userId))
  return { ok: state.buildings.length < before }
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
 * A post that announces an event, applied to the block that event is in.
 *
 * The stub's whole answer to "what does a post do to the city". Returns null
 * for a post that announces nothing, which is almost all of them, and then
 * nothing is written and no plan id moves. See `city-events.ts` for why this
 * is a fixed word list and not a model.
 */
export function applyEventFromPost(post: { text: string; community_id: string }): CommunityPlan | null {
  const target = eventCommunityFor(post, VENUE_COMMUNITY_ID)
  if (!target) return null
  const previous = state.plans.get(target)
  if (!previous) return null
  const next = eventPlan(previous, `${target}:event:${Date.now()}`)
  state.plans.set(target, next)
  touch()
  return next
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
