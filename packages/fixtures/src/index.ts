/**
 * Product-owned fixtures. Everything here exists so that every module can run
 * before the module that really owns the data has landed it.
 *
 * Naming rule: a file called `*.fallback.json` is a placeholder Product wrote
 * and another owner will replace (plans, shop). A file with no suffix is
 * genuinely Product's for the weekend (`posts.seed.json`). The city is no
 * longer one of these: it comes from `@living-city/map`.
 *
 * See docs/05-team-workflow.md section 3.
 */
import { processedCity } from '@living-city/map'
import incidentsRaw from '../data/incidents.mock.json'
import postsRaw from '../data/posts.seed.json'
import plansRaw from '../data/plans.fallback.json'
import shopRaw from '../data/shop.fallback.json'
import type {
  CommunityGeo, CommunityPlan, DecorationSlot, SeedPost, SeedUser, ShopItem,
} from './types'
import type { Incident } from '@living-city/contracts'

/** Strip `_note` / `_readme` developer annotations before anything consumes a fixture. */
const clean = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(clean) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('_')) continue
      out[k] = clean(v)
    }
    return out as T
  }
  return value
}

export type {
  CommunityGeo, CommunityPlan, DecorationSlot, SeedPost, SeedUser, ShopItem,
} from './types'
export type { Incident } from '@living-city/contracts'

/**
 * The real hand-drawn city from the Map owner, not a Product placeholder.
 * `city.fallback.json` is gone: it existed only so the app could render before
 * Map landed, and keeping a second copy of the city around invites the two to
 * drift.
 */
export const communities: CommunityGeo[] = [...processedCity.communities] as CommunityGeo[]
export const slots: DecorationSlot[] = [...processedCity.slots] as DecorationSlot[]
export const seedUsers: SeedUser[] = clean(postsRaw.users) as SeedUser[]
export const seedPosts: SeedPost[] = clean(postsRaw.posts) as SeedPost[]
export const incidentMocks: Incident[] = clean(incidentsRaw.incidents) as Incident[]
export const fallbackPlans: CommunityPlan[] = clean(plansRaw.plans) as CommunityPlan[]
export const presetFestivalPlan: CommunityPlan = clean(plansRaw.preset_festival) as CommunityPlan
export const shopItems: ShopItem[] = clean(shopRaw.items) as ShopItem[]

/** The block the demo script builds around. Kept sparse on purpose. docs/04 section 8. */
export const DEMO_COMMUNITY_ID = 'kw:laurelwood'

/** The venue sits inside this block, so judges' posts land here. docs/04 section 10. */
export const VENUE_COMMUNITY_ID = 'kw:uw-northwest-campus'
