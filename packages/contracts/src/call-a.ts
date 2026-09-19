import { z } from 'zod'
import {
  DIMENSIONS, activityType, contentFlag, eventScale, incidentEvidence,
  incidentType, placeType, temporalScope,
} from './enums'

/** docs/03 sections 2.2 and 3.1. */

const score = z.number().min(0).max(100)

/** null means no evidence. Never a guessed 50. docs/03 rule 1. */
export const dimensions = z.object(
  Object.fromEntries(DIMENSIONS.map((d) => [d, score.nullable()])) as Record<
    (typeof DIMENSIONS)[number],
    z.ZodNullable<typeof score>
  >,
)

export const timeContext = z.object({
  local_time: z.string().regex(/^\d{2}:\d{2}$/),
  day_type: z.enum(['weekday', 'weekend', 'holiday']),
  time_bucket: z.enum(['morning', 'afternoon', 'evening', 'night']),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
})

export const postInput = z.object({
  post_id: z.string(),
  text: z.string().max(1000),
  image_caption: z.string().nullable(),
  community_id: z.string().nullable(),
  community_name: z.string().nullable(),
  time_context: timeContext,
  lang_hint: z.string().nullable(),
  is_incident_report: z.boolean(),
  reported_incident_type: incidentType.nullable(),
  taxonomy_version: z.string(),
})

export const incidentBlock = z.object({
  type: incidentType,
  severity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  /** Free text from the post. Never coordinates. docs/03 rule 25. */
  location_hint: z.string().nullable(),
  evidence: incidentEvidence,
})

export const postAnalysis = z.object({
  post_id: z.string(),
  schema_version: z.literal('1.0'),
  about_location: score,
  confidence: score,
  language: z.string(),
  dimensions,
  valence: z.number().min(-100).max(100).nullable(),
  activity_type: activityType,
  place_type: placeType,
  temporal_scope: temporalScope,
  event_scale: eventScale,
  tags: z.array(z.string()).max(5),
  keywords: z.array(z.string()).max(5),
  image_evidence: z.array(z.string()).max(4),
  content_flags: z.array(contentFlag),
  incident: incidentBlock,
})
.refine((a) => a.incident.type !== 'none' || a.incident.severity === 0, {
  message: 'severity must be 0 when incident.type is "none"',
  path: ['incident', 'severity'],
})
.refine((a) => a.incident.type === 'none' || a.incident.severity > 0, {
  message: 'a real incident needs severity 1, 2 or 3',
  path: ['incident', 'severity'],
})
.refine((a) => !a.content_flags.includes('unsafe') || a.about_location === 0, {
  message: 'unsafe content must have about_location 0 (docs/03 rule 15)',
  path: ['about_location'],
})

/** Call A accepts 1 to 20 posts per request and answers in input order. */
export const postInputBatch = z.array(postInput).min(1).max(20)
export const postAnalysisBatch = z.array(postAnalysis)

export type Dimensions = z.infer<typeof dimensions>
export type PostInput = z.infer<typeof postInput>
export type PostAnalysis = z.infer<typeof postAnalysis>
export type IncidentBlock = z.infer<typeof incidentBlock>
