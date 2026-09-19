import {
  ACTIVITY_TYPE, CONTENT_FLAG, DIMENSIONS, INCIDENT_TYPE, PLACE_TYPE,
  postAnalysis, type AssetTaxonomy, type PostAnalysis, type PostInput,
} from '@living-city/contracts'
import { correction, type CorrectionLog } from '../log'
import { allowed } from '../taxonomy'

/**
 * The Call A validator. docs/03 section 7, docs/02 section 4.2.
 *
 * Principle 2 in docs/03 section 8: interpretation and execution are separated
 * by a validator, so a prompt bug can only produce a corrected or dropped
 * analysis, never a broken city. Every correction is logged, because a rising
 * correction rate is the first sign a prompt edit went wrong.
 *
 * Returns null when the analysis cannot be salvaged. The caller leaves the post
 * `pending` and logs it; it never reaches the aggregator half-formed.
 */

const ACTIVITY = new Set<string>(ACTIVITY_TYPE)
const PLACE = new Set<string>(PLACE_TYPE)
const FLAGS = new Set<string>(CONTENT_FLAG)
const INCIDENTS = new Set<string>(INCIDENT_TYPE)
const TEMPORAL = new Set(['moment', 'recurring', 'persistent', 'unknown'])
const EVENT_SCALE = new Set(['none', 'small', 'medium', 'large'])
const EVIDENCE = new Set(['observed', 'heard', 'form', 'none'])

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const clampScore = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

const nullableScore = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

const dedupe = (values: string[]): string[] => [...new Set(values)]

const pickEnum = (
  value: unknown, set: ReadonlySet<string>, fallback: string,
  field: string, log: CorrectionLog,
): string => {
  if (typeof value === 'string' && set.has(value)) return value
  if (value !== undefined && value !== null && value !== fallback) {
    correction(log, `${field}: dropped unknown value ${JSON.stringify(value)}, used "${fallback}"`)
  }
  return fallback
}

/**
 * docs/03 rule 25 and its failure row: a location_hint must never carry
 * coordinates. Decimal degrees, degree symbols and explicit lat/lon labels all
 * mean the model resolved something it was told not to resolve.
 */
const COORDINATE_LIKE = /(-?\d{1,3}\.\d{3,})|(\d+\s*°)|\b(lat|lon|lng|latitude|longitude)\b/i

/** Keywords must not carry contact details or handles. docs/03 rule 16. */
const PII_LIKE = /(@[\w.]+)|(\+?\d[\d\s().-]{6,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/

const cleanKeyword = (kw: string): string | null => {
  const trimmed = kw.trim().toLowerCase()
  if (!trimmed || PII_LIKE.test(trimmed)) return null
  const words = trimmed.split(/\s+/)
  if (words.length > 3) return words.slice(0, 3).join(' ')
  return trimmed
}

export type ImageState = 'present' | 'missing' | 'none'

export type ValidateCallAOptions = {
  input: PostInput
  taxonomy: AssetTaxonomy
  /** What actually happened to the image, which the model cannot know. */
  imageState?: ImageState
}

export const validatePostAnalysis = (
  raw: unknown,
  { input, taxonomy, imageState = 'none' }: ValidateCallAOptions,
  log: CorrectionLog = [],
): { analysis: PostAnalysis | null; log: CorrectionLog } => {
  const source = obj(raw)
  if (Object.keys(source).length === 0) {
    correction(log, 'analysis was not an object')
    return { analysis: null, log }
  }

  // post_id is the join key for everything downstream. The model echoing the
  // wrong one would silently attach an analysis to another post, so the input
  // always wins.
  if (source.post_id !== input.post_id) {
    correction(log, `post_id: model returned ${JSON.stringify(source.post_id)}, forced to input id`)
  }

  // docs/03 section 4.3 rejects version mismatches rather than guessing. For a
  // plan that means keeping the previous one; for a post there is nothing to
  // keep, and dropping a judge's post over an echoed string is a worse demo
  // failure than the mismatch it guards against. So: correct and log loudly.
  if (source.schema_version !== '1.0') {
    correction(log, `schema_version: expected "1.0", got ${JSON.stringify(source.schema_version)}`)
  }

  const flags = dedupe(strings(source.content_flags).filter((f) => {
    if (FLAGS.has(f)) return true
    correction(log, `content_flags: dropped unknown flag "${f}"`)
    return false
  }))

  const addFlag = (flag: string) => { if (!flags.includes(flag)) flags.push(flag) }

  // Facts the caller knows and the model does not.
  if (imageState === 'missing' && !flags.includes('image_missing')) {
    addFlag('image_missing')
    correction(log, 'content_flags: added "image_missing" (image failed to load)')
  }
  if (input.community_id === null && !flags.includes('no_community')) {
    addFlag('no_community')
    correction(log, 'content_flags: added "no_community" (post outside every polygon)')
  }
  if (input.text.trim() === '' && imageState !== 'present' && !flags.includes('empty')) {
    addFlag('empty')
    correction(log, 'content_flags: added "empty" (no text and no image)')
  }
  if (imageState === 'present' && input.text.trim() === '' && !flags.includes('image_only')) {
    addFlag('image_only')
    correction(log, 'content_flags: added "image_only" (no text)')
  }

  const unsafe = flags.includes('unsafe')

  const rawDimensions = obj(source.dimensions)
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => [d, unsafe ? null : nullableScore(rawDimensions[d])]),
  ) as PostAnalysis['dimensions']

  let aboutLocation = clampScore(source.about_location)
  if (unsafe && aboutLocation !== 0) {
    correction(log, 'about_location: forced to 0 for unsafe content (rule 15)')
    aboutLocation = 0
  }
  if (!unsafe && aboutLocation > 20) {
    // Rule 14: spam and advertising cap out at 20 whatever the model said.
    const capped = flags.some((f) => f === 'spam' || f === 'advertising' || f === 'not_about_place')
    if (capped) {
      correction(log, `about_location: capped ${aboutLocation} to 20 for flagged content (rule 14)`)
      aboutLocation = 20
    }
  }

  let valence: number | null = null
  if (!unsafe && source.valence !== null && source.valence !== undefined) {
    const n = Number(source.valence)
    if (Number.isFinite(n)) valence = Math.max(-100, Math.min(100, Math.round(n)))
  }

  const controlledTags = allowed(taxonomy, 'tags')
  const tags = unsafe ? [] : dedupe(strings(source.tags).filter((t) => {
    if (controlledTags.has(t)) return true
    correction(log, `tags: dropped uncontrolled tag "${t}"`)
    return false
  })).slice(0, 5)

  const keywords = unsafe ? [] : dedupe(
    strings(source.keywords)
      .map(cleanKeyword)
      .filter((k): k is string => k !== null),
  ).slice(0, 5)
  if (!unsafe && keywords.length < strings(source.keywords).length) {
    correction(log, 'keywords: dropped or trimmed entries failing rule 16')
  }

  const imageEvidence = unsafe ? [] : dedupe(strings(source.image_evidence)).slice(0, 4)

  // ---- incident block, docs/03 rules 23 to 27 ------------------------------

  const rawIncident = obj(source.incident)
  let incidentType = pickEnum(rawIncident.type, INCIDENTS, 'none', 'incident.type', log)

  // An unsafe post is excluded from everything downstream, and hidden posts
  // never produce incidents (docs/02 section 4.7). Do not file one.
  if (unsafe && incidentType !== 'none') {
    correction(log, 'incident: cleared on unsafe content')
    incidentType = 'none'
  }

  let severity = 0
  if (incidentType !== 'none') {
    const n = Number(rawIncident.severity)
    severity = Number.isFinite(n) ? Math.max(1, Math.min(3, Math.round(n))) : 1
    if (severity !== rawIncident.severity) {
      correction(log, `incident.severity: ${JSON.stringify(rawIncident.severity)} -> ${severity}`)
    }
  } else if (Number(rawIncident.severity) > 0) {
    correction(log, 'incident.severity: forced to 0 because type is "none"')
  }

  let locationHint: string | null = null
  if (incidentType !== 'none' && typeof rawIncident.location_hint === 'string') {
    const hint = rawIncident.location_hint.trim().slice(0, 120)
    if (!hint) locationHint = null
    else if (COORDINATE_LIKE.test(hint)) {
      correction(log, `incident.location_hint: dropped, looked like coordinates (${hint})`)
    } else locationHint = hint
  }

  let evidence = pickEnum(
    rawIncident.evidence, EVIDENCE,
    incidentType === 'none' ? 'none' : 'observed',
    'incident.evidence', log,
  )
  if (incidentType === 'none') evidence = 'none'

  if (input.is_incident_report) {
    // Rule 26: the author declared it on the form, so evidence is "form"
    // whatever the model guessed.
    if (evidence !== 'form' && incidentType !== 'none') {
      correction(log, 'incident.evidence: forced to "form" (submitted through the report form)')
      evidence = 'form'
    }
    // docs/03 section 7: when the model's type contradicts the form, keep the
    // model's reading, keep evidence "form", and flag it so staff see both.
    const reported = input.reported_incident_type
    if (reported && reported !== 'none' && incidentType !== reported) {
      correction(
        log,
        `incident.type: model said "${incidentType}", form said "${reported}"; kept model, flagged unclear`,
      )
      addFlag('unclear')
    }
    if (incidentType === 'none' && reported && reported !== 'none') {
      correction(log, `incident.type: model found none but form reported "${reported}"; flagged unclear`)
      addFlag('unclear')
    }
  }

  const candidate = {
    post_id: input.post_id,
    schema_version: '1.0' as const,
    about_location: aboutLocation,
    confidence: unsafe ? clampScore(source.confidence, 0) : clampScore(source.confidence),
    language: typeof source.language === 'string' && source.language ? source.language : 'und',
    dimensions,
    valence,
    activity_type: pickEnum(source.activity_type, ACTIVITY, 'unknown', 'activity_type', log),
    place_type: pickEnum(source.place_type, PLACE, 'unknown', 'place_type', log),
    temporal_scope: pickEnum(source.temporal_scope, TEMPORAL, 'unknown', 'temporal_scope', log),
    event_scale: pickEnum(source.event_scale, EVENT_SCALE, 'none', 'event_scale', log),
    tags,
    keywords,
    image_evidence: imageEvidence,
    content_flags: flags,
    incident: { type: incidentType, severity, location_hint: locationHint, evidence },
  }

  const parsed = postAnalysis.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      correction(log, `schema: ${issue.path.join('.')} ${issue.message}`)
    }
    return { analysis: null, log }
  }

  return { analysis: parsed.data, log }
}
