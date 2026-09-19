/**
 * Thin typed wrappers over the routes in docs/02 section 8.
 *
 * Shapes are what the stub returns today. When Pipeline and Civic land the real
 * routes the shapes stay, so only the bodies behind them change.
 */
import type { CommunityPlan } from '@living-city/fixtures'
import type { CityPayload, Placement } from '@/components/city'

export type PostRow = {
  id: string
  user_id: string
  text: string
  image_url: string | null
  created_at: string
  community_id: string
  author_name: string
  likes: number
  liked: boolean
}

/** What the panel shows. Pipeline's real `SemanticState` is richer. */
export type BlockState = {
  community_id: string
  summary: string
  mood: string
  top_tags: string[]
  reasons: string[]
  post_count: number
}

export type Me = {
  user: { id: string; display_name: string; role: 'resident' | 'government' }
  balance: number
  inventory: Record<string, number>
}

const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json() as Promise<T>
}

export const getCity = () => get<CityPayload>('/api/city')
export const getMe = () => get<Me>('/api/me')
export const getMyPlacements = () =>
  get<{ placements: Placement[] }>('/api/me/placements').then((d) => d.placements)
export const getFeed = () => get<{ posts: PostRow[] }>('/api/posts').then((d) => d.posts)

export const getPlan = (id: string) =>
  get<{ plan: CommunityPlan }>(`/api/communities/${encodeURIComponent(id)}/plan`)
    .then((d) => d.plan)
    .catch(() => null)

export const getBlockState = (id: string) =>
  get<BlockState>(`/api/communities/${encodeURIComponent(id)}/state`)

export const getBlockPosts = (id: string) =>
  get<{ posts: PostRow[] }>(`/api/communities/${encodeURIComponent(id)}/posts`).then((d) => d.posts)

export const toggleLike = (postId: string) =>
  fetch(`/api/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' }).then(
    (r) => r.json() as Promise<{ liked: boolean; balance: number; likes: number }>,
  )

/** All plans at once; there is no bulk route in docs/02 section 8. */
export async function getAllPlans(ids: string[]): Promise<CommunityPlan[]> {
  const plans = await Promise.all(ids.map(getPlan))
  return plans.filter((p): p is CommunityPlan => p !== null)
}
