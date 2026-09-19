import { z } from 'zod'
import { incidentType } from './enums'

/** The stored shapes in docs/02 section 7. */

export const user = z.object({
  id: z.string(),
  display_name: z.string(),
  role: z.enum(['resident', 'government']),
  created_at: z.string(),
})

export const post = z.object({
  id: z.string(),
  user_id: z.string(),
  text: z.string(),
  image_url: z.string().nullable().optional(),
  lon: z.number(),
  lat: z.number(),
  created_at: z.string(),
  community_id: z.string().nullable().optional(),
  is_incident_report: z.boolean(),
  status: z.enum(['pending', 'analyzed']),
  hidden: z.boolean(),
  hidden_reason: z.enum(['auto', 'operator']).nullable(),
})

export const like = z.object({ user_id: z.string(), post_id: z.string(), created_at: z.string() })

export const pointsLedgerEntry = z.object({
  id: z.string(),
  user_id: z.string(),
  delta: z.number().int(),
  reason: z.string(),
  ref_id: z.string().nullable(),
  created_at: z.string(),
})

export const shopItem = z.object({
  item_tag: z.string(),
  price: z.number().int().min(0),
  category: z.string(),
  taxonomy_version: z.string(),
})

export const inventoryRow = z.object({
  user_id: z.string(),
  item_tag: z.string(),
  quantity: z.number().int().min(0),
})

export const placement = z.object({
  id: z.string(),
  user_id: z.string(),
  community_id: z.string(),
  slot_id: z.string(),
  item_tag: z.string(),
  created_at: z.string(),
})

export const incident = z.object({
  id: z.string(),
  post_id: z.string(),
  community_id: z.string(),
  type: incidentType,
  severity: z.number().int().min(0).max(3),
  location_hint: z.string().nullable(),
  reported_at: z.string(),
  source: z.string(),
  /** "resolved" is product scope, not built this weekend. docs/02 section 4.7. */
  status: z.enum(['reported', 'verified']),
  staff_note: z.string().nullable(),
  updated_at: z.string(),
})

/** Points values from docs/01 section 8.8. Starting values, tunable. */
export const POINTS = {
  post: 10,
  post_with_photo: 20,
  comment_given: 3,
  like_given: 1,
  like_received: 2,
  comment_received: 4,
  first_post_in_community_today: 5,
  verified_incident_report: 25,
} as const

export type User = z.infer<typeof user>
export type Post = z.infer<typeof post>
export type Incident = z.infer<typeof incident>
export type Placement = z.infer<typeof placement>
export type ShopItem = z.infer<typeof shopItem>
