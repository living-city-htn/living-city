import {
  ACTIVITY_TYPE, CONTENT_FLAG, DIMENSIONS, INCIDENT_TYPE, PLACE_TYPE,
} from '@living-city/contracts'
import type { JsonSchema } from '../provider/types'

/**
 * The `responseSchema` handed to the API for Call A, so the shape is enforced
 * by the provider instead of requested by the prompt. docs/03 section 9.
 *
 * This is the OpenAPI subset the API accepts, not JSON Schema proper: no
 * `refine`, no unions, no min/max on numbers. Ranges (0-100, severity 0-3) and
 * the cross-field rules therefore live in the validator, which is where docs/03
 * section 8 principle 2 wants them anyway. Zod in `packages/contracts` stays
 * the source of truth; this is generated from the same enum tuples so the two
 * cannot drift.
 */

const nullableNumber = { type: 'number', nullable: true } as const

const dimensionsSchema: JsonSchema = {
  type: 'object',
  properties: Object.fromEntries(DIMENSIONS.map((d) => [d, { ...nullableNumber }])),
  required: [...DIMENSIONS],
  propertyOrdering: [...DIMENSIONS],
}

const incidentSchema: JsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...INCIDENT_TYPE] },
    severity: { type: 'integer' },
    location_hint: { type: 'string', nullable: true },
    evidence: { type: 'string', enum: ['observed', 'heard', 'form', 'none'] },
  },
  required: ['type', 'severity', 'location_hint', 'evidence'],
  propertyOrdering: ['type', 'severity', 'location_hint', 'evidence'],
}

export const postAnalysisSchema: JsonSchema = {
  type: 'object',
  properties: {
    post_id: { type: 'string' },
    schema_version: { type: 'string' },
    about_location: { type: 'integer' },
    confidence: { type: 'integer' },
    language: { type: 'string' },
    dimensions: dimensionsSchema,
    valence: { ...nullableNumber },
    activity_type: { type: 'string', enum: [...ACTIVITY_TYPE] },
    place_type: { type: 'string', enum: [...PLACE_TYPE] },
    temporal_scope: { type: 'string', enum: ['moment', 'recurring', 'persistent', 'unknown'] },
    event_scale: { type: 'string', enum: ['none', 'small', 'medium', 'large'] },
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    image_evidence: { type: 'array', items: { type: 'string' } },
    content_flags: { type: 'array', items: { type: 'string', enum: [...CONTENT_FLAG] } },
    incident: incidentSchema,
  },
  required: [
    'post_id', 'schema_version', 'about_location', 'confidence', 'language',
    'dimensions', 'valence', 'activity_type', 'place_type', 'temporal_scope',
    'event_scale', 'tags', 'keywords', 'image_evidence', 'content_flags', 'incident',
  ],
  propertyOrdering: [
    'post_id', 'schema_version', 'about_location', 'confidence', 'language',
    'dimensions', 'valence', 'activity_type', 'place_type', 'temporal_scope',
    'event_scale', 'tags', 'keywords', 'image_evidence', 'content_flags', 'incident',
  ],
}

/**
 * The call always sends and receives an array, even for the single post the
 * inline handler analyses. docs/03 rule 21: one object per input post, in an
 * array, in input order. Keeping the shape constant keeps the prompt prefix
 * constant, which is what the cache is paying for.
 */
export const postAnalysisBatchSchema: JsonSchema = {
  type: 'array',
  items: postAnalysisSchema,
}
