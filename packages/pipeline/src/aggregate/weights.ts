import type { PostAnalysis } from '@living-city/contracts'
import { env } from '../env'

/**
 * The per-post weight. docs/02 section 4.3.
 *
 *   1 x confidence/100 x about_location/100 x (1 + 0.5 x log(1 + engagement)) x recency_decay
 *
 * The base weight is 1, so a brand-new post with no interactions carries full
 * weight. Engagement is a bonus, never a gate - which is what lets a judge's
 * first post move their block before anyone has liked it.
 */

/** docs/02 section 7: engagement is likes + 2 x comments at aggregation time. */
export const engagementOf = (likes: number, comments = 0): number => likes + 2 * comments

export const recencyDecay = (createdAt: string | Date, now: Date): number => {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  if (Number.isNaN(created.getTime())) return 1
  const ageHours = Math.max(0, (now.getTime() - created.getTime()) / 3_600_000)
  return 0.5 ** (ageHours / Math.max(0.1, env.recencyHalfLifeHours()))
}

/**
 * Flag handling, docs/02 section 4.3: `unsafe` is excluded entirely (weight 0,
 * the content never reaches Call B); `instruction_like`, `spam` and
 * `advertising` are halved rather than dropped, because a spammy post at a
 * place is still weak evidence that something is happening there.
 */
export const flagMultiplier = (flags: readonly string[]): number => {
  if (flags.includes('unsafe')) return 0
  const halved = flags.some(
    (f) => f === 'instruction_like' || f === 'spam' || f === 'advertising',
  )
  return halved ? env.flaggedWeight() : 1
}

export const postWeight = (
  analysis: PostAnalysis,
  options: { createdAt: string | Date; engagement?: number; now: Date },
): number => {
  const flags = flagMultiplier(analysis.content_flags)
  if (flags === 0) return 0
  const engagement = Math.max(0, options.engagement ?? 0)
  return (
    (analysis.confidence / 100)
    * (analysis.about_location / 100)
    * (1 + env.engagementFactor() * Math.log(1 + engagement))
    * recencyDecay(options.createdAt, options.now)
    * flags
  )
}
