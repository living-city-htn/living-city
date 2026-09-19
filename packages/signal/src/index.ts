/**
 * @living-city/signal - the Elasticsearch evidence index and the agentic civic
 * subsystem that reads it.
 *
 * The boundary, before anything else: the deterministic aggregator in
 * `packages/pipeline` remains the only input to planning. This package reads
 * the same `PostAnalysis` records the aggregator reads, and writes nothing that
 * Call B or the renderer depends on. It sits behind `SIGNAL_LAYER`, off by
 * default; with the flag off the post flow, the aggregator, Call B and the
 * renderer behave exactly as they did before this package existed.
 *
 * Owned by the Civic role (integration/EVENT-FACTS.md decision 5).
 */
export { env as signalEnv } from './env'
export {
  ElasticError,
  getClient,
  healthReason,
  isAvailable,
  resetHealth,
  withElastic,
  type Es,
  type EsqlResult,
} from './client'
export { log as signalLog } from './log'
export { MAPPING_VERSION, ensureIndex, indexBody, type EnsureResult } from './mapping'
export {
  authenticityOf, buildDoc, docIdOf, embeddableText, summarise,
  type IndexableBlock, type IndexablePost, type SignalDoc,
} from './doc'
export { embed, embedMany, embeddingsAvailable } from './embed'
export {
  backfill, indexPost, removePost, resetIngestState,
  type BackfillResult, type BackfillRow, type IngestResult,
} from './ingest'
export {
  civicRead, setCivicReadPort,
  type CivicReadPort, type EvidenceQuery, type EvidenceRecord,
} from './ports'
export {
  searchEvidence, windowStart,
  type EvidenceHit, type SearchEvidenceParams, type SearchEvidenceResult, type SearchMode,
} from './retrieval'
export { encodeGeohash, GEOHASH_PRECISION } from './geohash'
export {
  blockTrends, incidentClusters, incidentClustersQuery, risingStress, risingStressQuery,
  haversineMetres, CLUSTER_RADIUS_M, CLUSTER_CELL_PRECISION,
  type BlockTrend, type BlockTrendsResult, type IncidentCluster,
  type IncidentClustersResult, type QueryMetadata, type RisingBlock, type RisingStressResult,
} from './aggregations'
export {
  annotate, annotationOf, finishRun, getAction, listActions, listAnnotations, listRuns,
  listSuggestions, lockField, markReverted, record, resetSignalStore, resolveSuggestion,
  runsSince, spentUsd, staffTouched, startRun, suggest,
  type AgentAction, type AgentActionKind, type AgentRunLog, type AgentSuggestion,
  type IncidentAnnotation,
} from './store'
export {
  civicWrite, setCivicWritePort,
  type CivicWritePort, type IncidentPatch, type NewIncident,
} from './ports'
