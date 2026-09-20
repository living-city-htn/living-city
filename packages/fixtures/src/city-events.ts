/**
 * The stub's stand-in for a planning cycle, for posts that announce an event.
 *
 * With `USE_FIXTURES=1` there is no Call A and no Call B, so a post lands, the
 * block's plan id never moves, and moment 4 has nothing to show. `replan` only
 * bumps the id, which makes the poll fire and the city look identical. This
 * module is what makes the block actually change without a provider key.
 *
 * It is deterministic code, not a model, and it stays inside the line docs/04
 * section 8 draws: a fixed vocabulary of event words decides which block is
 * celebrating, and the plan it writes changes only mood, lighting, effects,
 * activity and decorations. Archetype, density, height profile, buildings and
 * vegetation are copied from the plan the block already had, which is the
 * "identity stayed, mood changed" the presenter says out loud.
 *
 * None of this runs once the pipeline is on. Call B owns the plan then, and
 * `POST /api/posts` never reaches here.
 */
import type { CommunityPlan } from './types'

/**
 * Hack the North happens at the venue, wherever the poster is standing. A post
 * naming it lights up the venue block rather than the block it was posted
 * from, because that is the thing the post is about.
 */
const HACK_THE_NORTH = /\bhack\s*the\s*north\b|\bhackthenorth\b|\bhtn\b/i

/** Anything else that plainly announces a live event, for its own block. */
const LIVE_EVENT =
  /\b(festival|hackathon|concert|live music|block party|street party|parade|fireworks|night market)\b/i

/**
 * Which block this post turns festive, or null for the overwhelming majority
 * of posts that are just posts. One block per post: a post is not evidence
 * about a city, it is evidence about a place.
 */
export function eventCommunityFor(
  post: { text: string; community_id: string },
  venueCommunityId: string,
): string | null {
  if (HACK_THE_NORTH.test(post.text)) return venueCommunityId
  if (LIVE_EVENT.test(post.text)) return post.community_id
  return null
}

/** First tag wins, so the event's own decorations sit in front of the block's. */
function byTag(items: CommunityPlan['decorations']): CommunityPlan['decorations'] {
  const seen = new Set<string>()
  const kept: CommunityPlan['decorations'] = []
  for (const item of items) {
    if (seen.has(item.tag)) continue
    seen.add(item.tag)
    kept.push(item)
  }
  return kept
}

/**
 * The same block, mid-event. Everything geometric is the previous plan's, so a
 * rebuild moves the light and the crowd and leaves the skyline where it was.
 */
export function eventPlan(previous: CommunityPlan, planId: string): CommunityPlan {
  return {
    ...previous,
    plan_id: planId,
    summary: 'An event has taken over this block: lights, music and a crowd after dark.',
    mood: 'festive',
    palette: 'sunset_orange',
    activity: {
      ...previous.activity,
      pedestrian_density: 5,
      crowd_clusters: 4,
      behaviors: ['dancing', 'performing', 'walking', 'sitting', 'dining'],
    },
    decorations: byTag([
      { tag: 'string_lights', prominence: 3 },
      { tag: 'stage', prominence: 3 },
      { tag: 'food_trucks', prominence: 2 },
      ...previous.decorations,
    ]).slice(0, 8),
    lighting: {
      signature_time: 'night',
      intensity: 5,
      color_temp: 'warm',
      accents: ['string_lights', 'spotlights', 'lanterns'],
    },
    // Exactly the three the scene already draws for a festive campus, so this
    // adds no breadth over docs/04 section 3.
    effects: ['fireworks', 'music_notes', 'sparkles'],
    stability: {
      change_magnitude: 'moderate',
      retained_from_previous: [
        'archetype', 'density', 'height_profile', 'building_composition', 'vegetation',
      ],
      reasons: ['identity retained, mood and lighting changed by a live event'],
    },
    confidence: 90,
  }
}
