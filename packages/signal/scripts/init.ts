/**
 * `pnpm --filter @living-city/signal signal:init`, or `pnpm signal:init` from
 * the repo root.
 *
 * Creates the `posts-signal` index if it is absent and prints what it did.
 * Idempotent: running it twice is a no-op, and it never rewrites an existing
 * mapping (see the note on `ensureIndex`).
 *
 * Exits non-zero only when the layer is configured and the cluster refused. A
 * missing `SIGNAL_LAYER` or `ELASTIC_URL` is a clean exit, because "the signal
 * layer is off" is a valid state for this repo and not an error worth failing
 * a script over.
 */
import { ensureIndex, getClient, indexBody, isAvailable, signalEnv } from '../src/index'

const main = async () => {
  if (!signalEnv.enabled()) {
    console.log('SIGNAL_LAYER is off. Set SIGNAL_LAYER=on to use the signal layer.')
    return
  }
  if (!signalEnv.elasticUrl()) {
    console.log('ELASTIC_URL is not set. Nothing to initialise.')
    return
  }

  const client = getClient()
  if (!client || !(await isAvailable())) {
    console.error(`Cannot reach ${signalEnv.elasticUrl()}. Is the cluster up?`)
    process.exitCode = 1
    return
  }

  const result = await ensureIndex(client)
  if (!result.ok) {
    console.error(`Failed to create ${result.index}: ${result.reason}`)
    process.exitCode = 1
    return
  }

  const dims = indexBody().mappings.properties.embedding.dims
  console.log(
    result.created
      ? `Created ${result.index} (1 shard, 0 replicas, ${dims}-dim cosine vectors).`
      : `${result.index} already exists. Left alone.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
