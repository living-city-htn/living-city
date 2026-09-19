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
