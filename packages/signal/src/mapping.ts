/**
 * The `posts-signal` index: mapping, settings, and an idempotent `ensureIndex()`.
 *
 * One document per post. The document is derived from the `Post` row and its
 * `PostAnalysis` (packages/contracts), which is the same material the
 * deterministic aggregator reads - this index is a second reader of that data,
 * never a writer of it.
 *
 * Three kinds of field, and the distinction is the whole design:
 *
 *   searchable        `text`, analysed, scored by BM25. Only three fields earn
 *                     this: the post text, the image caption, and the analysis
 *                     summary this package derives. These are what a hybrid
 *                     query matches against.
 *
 *   filterable        `keyword`, `boolean`, `date`, `geo_point` and the numerics
 *                     the agent filters on. Exact-match and range only, no
 *                     analysis. Ids, enums, tags, flags, severity, confidence.
 *
 *   aggregation only  `index: false`, so the field costs no inverted index and
 *                     cannot be queried - but doc values remain, so `stats`,
 *                     `avg` and ES|QL still read it. The eleven dimensions and
 *                     `about_location` are here: the trend panel averages them
 *                     and nothing ever searches them.
 *
 * One shard and no replicas. At this scale (a demo city, low thousands of posts
 * at the very most) a second shard would only add a merge step to every query,
 * and a replica has nothing to fail over to on a single-node cluster.
 */
import { DIMENSIONS } from '@living-city/contracts'
import type { Es } from './client'
import { env } from './env'
import { log } from './log'

/**
 * Bump when the mapping below changes in a way that needs a reindex rather than
 * a redeploy. `ensureIndex` does not migrate: it creates the index when it is
 * absent and leaves an existing one alone, because silently changing a mapping
 * under a live index is how a demo loses its data mid-rehearsal.
 */
export const MAPPING_VERSION = '1.1'

/** Aggregation-only numeric: doc values, no inverted index. */
const aggOnly = { type: 'float', index: false } as const

const dimensionProperties = Object.fromEntries(
  DIMENSIONS.map((name) => [name, aggOnly]),
) as Record<(typeof DIMENSIONS)[number], typeof aggOnly>

export const indexBody = () => ({
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    // The ingest path indexes one document per post as the post is created, and
    // the civic page reads it seconds later. The default 1s is already fine;
    // naming it here stops a future "why is the new post missing" hunt.
    refresh_interval: '1s',
  },
  mappings: {
    _meta: { mapping_version: MAPPING_VERSION },
    dynamic: 'strict' as const,
    properties: {
      // ---- identity and provenance ---------------------------------------
      post_id: { type: 'keyword' },
      user_id: { type: 'keyword' },
      schema_version: { type: 'keyword' },
      mapping_version: { type: 'keyword' },

      // ---- searchable: the only three fields BM25 ever scores -------------
      text: { type: 'text' },
      image_caption: { type: 'text' },
      /**
       * A deterministic one-line rendering of the analysis (see `doc.ts`).
       * It exists so that a query like "flooding near the plaza" matches the
       * structured verdict as well as the resident's own words, and so the
       * dense vector has something denser than a two-word post to embed.
       */
      summary: { type: 'text' },

      // ---- filterable ------------------------------------------------------
      created_at: { type: 'date' },
      indexed_at: { type: 'date' },
      /** The drawn block. `Post.community_id` in packages/contracts. */
      community_id: { type: 'keyword' },
      /**
       * The official area the block was derived from, kept separate from the
       * drawn block id so a judge's "which ward is this" question has an answer
       * that is not the demo's own geometry. `CommunityGeo.source` decides
       * whether this is an admin boundary or a synthetic one.
       */
      official_area_id: { type: 'keyword' },
      area_source: { type: 'keyword' },
      city_id: { type: 'keyword' },
      /**
       * Server-side only. Raw lon/lat never leaves the server: geo queries run
       * in this package and responses carry block ids and distances, never
       * coordinates.
       */
      location: { type: 'geo_point' },
      /**
       * The precision-6 geohash cell the post falls in, computed at write time
       * (`geohash.ts`). It exists so ES|QL can group incidents into candidate
       * clusters with a plain `BY geohash`, without depending on which 8.x
       * minor added the spatial functions. Roughly 1.2 km by 0.6 km here, so it
       * is a pre-filter; the exact 500 m radius is a `geo_distance` refinement.
       */
      geohash: { type: 'keyword' },

      language: { type: 'keyword' },
      activity_type: { type: 'keyword' },
      place_type: { type: 'keyword' },
      temporal_scope: { type: 'keyword' },
      event_scale: { type: 'keyword' },
      tags: { type: 'keyword' },
      keywords: { type: 'keyword' },
      image_evidence: { type: 'keyword' },
      content_flags: { type: 'keyword' },

      /** Filterable: the agent's confidence floor is a range query on this. */
      confidence: { type: 'float' },
      /**
       * Not a contracts field. Derived in this package from what the analysis
       * already carries (see `doc.ts`), because `PostAnalysis` has no
       * authenticity score and adding one is Pipeline's call, not Civic's.
       * Recorded as a REQUEST in SIGNAL.md rather than a contract change.
       */
      authenticity: { type: 'float' },
      valence: { type: 'float' },
      engagement: { type: 'integer' },

      is_incident_report: { type: 'boolean' },
      incident_type: { type: 'keyword' },
      incident_severity: { type: 'short' },
      incident_evidence: { type: 'keyword' },

      // ---- aggregation only -----------------------------------------------
      /** Averaged by the trend panel and by ES|QL. Never searched. */
      dimensions: { properties: dimensionProperties },
      about_location: aggOnly,

      // ---- vector ----------------------------------------------------------
      /**
       * `text-embedding-3-small` at 1536 dimensions, cosine similarity, over
       * the summary plus the post text. Generated server-side at write time
       * (`embed.ts`). When no key is configured the field is simply absent and
       * retrieval degrades to BM25 only rather than failing.
       */
      embedding: {
        type: 'dense_vector',
        dims: env.embeddingDims(),
        index: true,
        similarity: 'cosine',
      },
    },
  },
})

export type EnsureResult = {
  ok: boolean
  index: string
  created: boolean
  existed: boolean
  reason: string | null
}

/**
 * Create the index if it is absent. Safe to call on every boot and from the
 * init script; it never rewrites an existing mapping.
 */
export const ensureIndex = async (client: Es): Promise<EnsureResult> => {
  const index = env.indexName()
  try {
    if (await client.indexExists(index)) {
      return { ok: true, index, created: false, existed: true, reason: null }
    }
    await client.createIndex(index, indexBody())
    log.info('index.created', { index, mapping_version: MAPPING_VERSION })
    return { ok: true, index, created: true, existed: false, reason: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log.warn('index.ensure_failed', { index, reason })
    return { ok: false, index, created: false, existed: false, reason }
  }
}
