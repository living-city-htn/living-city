/**
 * Turning a `Post` plus its `PostAnalysis` into one `posts-signal` document.
 *
 * Everything here is deterministic. The only model call in the ingest path is
 * the embedding in `embed.ts`, and it embeds the output of this file; nothing
 * in this module asks a model what a post means, because Call A already
 * answered that and the answer is the input.
 */
import type { PostAnalysis } from '@living-city/contracts'
import { DIMENSIONS } from '@living-city/contracts'
import { MAPPING_VERSION } from './mapping'

/** The `Post` fields this package reads. A structural subset, so the web app
 *  can pass its own row type without a cast. */
export type IndexablePost = {
  id: string
  user_id: string
  text: string
  image_url?: string | null
  lon: number
  lat: number
  created_at: string
  community_id: string
  is_incident_report: boolean
  hidden: boolean
}

/** What the block the post belongs to contributes. All optional: a post whose
 *  block is unknown is still worth indexing. */
export type IndexableBlock = {
  official_area_id?: string | null
  area_source?: string | null
  city_id?: string | null
}

export type SignalDoc = Record<string, unknown>

const round = (n: number, places = 3): number => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * A deterministic one-line rendering of the analysis.
 *
 * It earns its place twice. BM25 gets to match the structured verdict
 * ("flooding, severity 2, observed") as well as the resident's own words, so a
 * staff query in civic vocabulary finds a post written in resident vocabulary.
 * And the embedding gets something denser than a four-word post to work with,
 * which is most of the difference between useful and useless vectors at this
 * corpus size.
 */
export const summarise = (analysis: PostAnalysis): string => {
  const parts: string[] = []

  if (analysis.place_type !== 'unknown') parts.push(analysis.place_type)
  if (analysis.activity_type !== 'unknown') parts.push(analysis.activity_type)

  // Only dimensions with evidence. A null is "no evidence", never a guessed 50
  // (docs/03 rule 1), and writing it as a number here would invent one.
  const strong = DIMENSIONS
    .map((name) => [name, analysis.dimensions[name]] as const)
    .filter((entry): entry is readonly [(typeof DIMENSIONS)[number], number] =>
      entry[1] !== null && entry[1] >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)
  if (strong.length) parts.push(`high ${strong.join(' and ')}`)

  if (analysis.incident.type !== 'none') {
    parts.push(`${analysis.incident.type} severity ${analysis.incident.severity}`)
    parts.push(`${analysis.incident.evidence} report`)
    if (analysis.incident.location_hint) parts.push(analysis.incident.location_hint)
  }

  if (analysis.event_scale !== 'none') parts.push(`${analysis.event_scale} event`)
  if (analysis.temporal_scope !== 'unknown') parts.push(analysis.temporal_scope)
  if (analysis.tags.length) parts.push(analysis.tags.join(' '))

  return parts.join(', ')
}

/**
 * How much weight a single report deserves before any corroboration, 0 to 100.
 *
 * `PostAnalysis` has no authenticity field and adding one is Pipeline's call,
 * not Civic's, so this derives one from what the analysis already carries. It
 * is a REQUEST in SIGNAL.md, not a contract change.
 *
 * The four terms, and why each is there:
 *
 *   confidence        Call A's own certainty. The base, at half weight.
 *   about_location    a post that is not about a place is not evidence about a
 *                     block however confident the model was.
 *   evidence          `observed` beats `heard` beats `form` beats `none`. A
 *                     resident who saw it outranks one repeating a rumour.
 *   image_evidence    a photo the analysis actually drew conclusions from.
 *
 * Content flags subtract: `spam`, `advertising` and `instruction_like` are the
 * three the aggregator already discounts (AGG_FLAGGED_WEIGHT), and `unclear`
 * costs a little. `unsafe` is not handled here because an unsafe post is
 * hidden and hidden posts are never indexed.
 */
export const authenticityOf = (analysis: PostAnalysis): number => {
  let score = analysis.confidence * 0.5 + analysis.about_location * 0.2

  const evidence = { observed: 20, heard: 10, form: 12, none: 0 }
  score += evidence[analysis.incident.evidence]

  if (analysis.image_evidence.length > 0) score += 10

  for (const flag of analysis.content_flags) {
    if (flag === 'spam' || flag === 'advertising' || flag === 'instruction_like') score -= 25
    else if (flag === 'unclear' || flag === 'not_about_place') score -= 10
  }

  return round(Math.max(0, Math.min(100, score)), 1)
}

/**
 * The text that gets embedded. Summary first so that the structured verdict
 * dominates a long rambling post rather than the other way round, then the
 * resident's own words, capped so one very long post cannot cost ten times
 * what a normal one does.
 */
export const embeddableText = (post: IndexablePost, analysis: PostAnalysis): string =>
  `${summarise(analysis)}\n\n${post.text}`.slice(0, 2000)

/**
 * The document id is the post id. That makes indexing idempotent - a backfill
 * over rows that are already indexed rewrites them rather than duplicating
 * them - and makes the hide path a delete by known id rather than a query.
 */
export const docIdOf = (post: IndexablePost): string => post.id

export const buildDoc = (
  post: IndexablePost,
  analysis: PostAnalysis,
  options: { block?: IndexableBlock; engagement?: number; embedding?: number[] | null } = {},
): SignalDoc => {
  const dimensions = Object.fromEntries(
    DIMENSIONS
      .map((name) => [name, analysis.dimensions[name]] as const)
      // A null dimension is absent from the document rather than zero, so an
      // `avg` aggregation averages the posts that had evidence instead of
      // being dragged down by the ones that did not.
      .filter((entry): entry is readonly [(typeof DIMENSIONS)[number], number] => entry[1] !== null),
  )

  const doc: SignalDoc = {
    post_id: post.id,
    user_id: post.user_id,
    schema_version: analysis.schema_version,
    mapping_version: MAPPING_VERSION,

    text: post.text,
    image_caption: null,
    summary: summarise(analysis),

    created_at: post.created_at,
    indexed_at: new Date().toISOString(),
    community_id: post.community_id,
    official_area_id: options.block?.official_area_id ?? null,
    area_source: options.block?.area_source ?? null,
    city_id: options.block?.city_id ?? null,
    // Server-side only. Nothing in this package ever returns it to a client.
    location: { lon: post.lon, lat: post.lat },

    language: analysis.language,
    activity_type: analysis.activity_type,
    place_type: analysis.place_type,
    temporal_scope: analysis.temporal_scope,
    event_scale: analysis.event_scale,
    tags: analysis.tags,
    keywords: analysis.keywords,
    image_evidence: analysis.image_evidence,
    content_flags: analysis.content_flags,

    confidence: analysis.confidence,
    authenticity: authenticityOf(analysis),
    valence: analysis.valence,
    engagement: options.engagement ?? 0,
    about_location: analysis.about_location,

    is_incident_report: post.is_incident_report,
    incident_type: analysis.incident.type,
    incident_severity: analysis.incident.severity,
    incident_evidence: analysis.incident.evidence,

    dimensions,
  }

  // Absent rather than null: `dense_vector` rejects null, and an absent vector
  // is exactly what the kNN half of retrieval skips over.
  if (options.embedding && options.embedding.length > 0) doc.embedding = options.embedding

  return doc
}
