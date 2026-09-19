'use client'

/**
 * The civic trend panel: the signal layer's read surface, on the operator page.
 *
 * It lives here rather than on a new page because the operator panel is the
 * only staff surface this app has - there is no separate government page, and
 * adding one would be a new route in the demo flow, which the task forbids. The
 * five-tab bar stays untouched.
 *
 * The panel renders nothing at all when `SIGNAL_LAYER` is off: the route
 * answers 404 and this collapses to a single line of text. Nothing on this page
 * changes for a demo run with the flag off.
 *
 * Every number is labelled with where it came from. A degraded panel says
 * "store fallback" against the figure rather than showing it as though
 * Elasticsearch answered, because a judge being shown a weaker number should be
 * told it is weaker.
 */
import { useCallback, useEffect, useState } from 'react'

type Metadata = { degraded: boolean; reason: string | null; took_ms: number; esql: string | null }

type Trends = {
  window: string
  blocks: Array<{
    community_id: string
    posts: number
    authors: number
    dimensions: Record<string, number>
    avg_confidence: number | null
    incidents: number
  }>
  metadata: Metadata
}

type Rising = {
  blocks: Array<{ community_id: string; current: number | null; previous: number | null; delta: number; posts: number }>
  metadata: Metadata
}

type Clusters = {
  clusters: Array<{
    cell: string
    community_id: string
    reports: number
    reports_within_500m: number
    max_severity: number
    types: string[]
    post_ids: string[]
  }>
  metadata: Metadata
}

type Payload = { trends: Trends; rising: Rising; clusters: Clusters }

const Source = ({ metadata }: { metadata: Metadata }) => (
  <span className="op-hint">
    {metadata.degraded ? 'store fallback' : 'elasticsearch'}
    {` · ${metadata.took_ms}ms`}
    {metadata.degraded && metadata.reason ? ` · ${metadata.reason}` : ''}
  </span>
)

const topDimensions = (dimensions: Record<string, number>, n = 3) =>
  Object.entries(dimensions).sort((a, b) => b[1] - a[1]).slice(0, n)

export default function SignalPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [off, setOff] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQueries, setShowQueries] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/civic/signal/trends?window=24h')
      .then(async (response) => {
        if (response.status === 404) { setOff(true); return null }
        if (!response.ok) throw new Error(`trends failed: ${response.status}`)
        return (await response.json()) as Payload
      })
      .then((payload) => { if (payload) { setData(payload); setOff(false); setError('') } })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  if (off) {
    return (
      <section className="op-card">
        <h2>Signal layer</h2>
        <p className="op-hint">
          Off. Set SIGNAL_LAYER=on and ELASTIC_URL to enable the evidence index,
          the trend panel and the civic agent.
        </p>
      </section>
    )
  }

  return (
    <section className="op-card">
      <div className="op-row op-row-spread">
        <h2>Signal layer</h2>
        <button className="op-btn op-btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="op-hint">
        Reads the same PostAnalysis records the aggregator reads. Writes nothing
        planning depends on.
      </p>

      {error && <p className="op-hint">Could not load: {error}</p>}

      {data && (
        <>
          <h3>Blocks, last {data.trends.window} <Source metadata={data.trends.metadata} /></h3>
          <ul className="op-blocks">
            {data.trends.blocks.length === 0 && <li className="op-hint">No posts in this window.</li>}
            {data.trends.blocks.map((block) => (
              <li key={block.community_id}>
                <span className="op-block-name">{block.community_id}</span>
                <code>
                  {block.posts} posts / {block.authors} authors
                  {block.incidents > 0 ? ` · ${block.incidents} incident` : ''}
                </code>
                <span className="op-hint">
                  {topDimensions(block.dimensions).map(([name, value]) => `${name} ${value}`).join(', ')
                    || 'no dimension evidence'}
                </span>
              </li>
            ))}
          </ul>

          <h3>Stress rising fastest, last hour <Source metadata={data.rising.metadata} /></h3>
          <ul className="op-blocks">
            {data.rising.blocks.length === 0 && (
              <li className="op-hint">
                No block has posts in both hours yet, so there is nothing to compare.
              </li>
            )}
            {data.rising.blocks.map((block) => (
              <li key={block.community_id}>
                <span className="op-block-name">{block.community_id}</span>
                <code>{block.delta > 0 ? `+${block.delta}` : block.delta}</code>
                <span className="op-hint">
                  {block.previous ?? '—'} → {block.current ?? '—'} over {block.posts} posts
                </span>
              </li>
            ))}
          </ul>

          <h3>Incident clusters, last 24h <Source metadata={data.clusters.metadata} /></h3>
          <ul className="op-blocks">
            {data.clusters.clusters.length === 0 && (
              <li className="op-hint">No cluster of more than one report.</li>
            )}
            {data.clusters.clusters.map((cluster) => (
              <li key={cluster.cell}>
                <span className="op-block-name">{cluster.community_id}</span>
                <code>
                  {cluster.reports_within_500m} within 500m
                  {cluster.reports !== cluster.reports_within_500m ? ` of ${cluster.reports} in cell` : ''}
                </code>
                <span className="op-hint">
                  {cluster.types.join(', ')} · max severity {cluster.max_severity}
                  {cluster.cell.startsWith('block:') ? ' · by block, not radius (fallback)' : ''}
                </span>
              </li>
            ))}
          </ul>

          <button className="op-btn op-btn-sm" onClick={() => setShowQueries((v) => !v)}>
            {showQueries ? 'Hide the queries' : 'Show the queries'}
          </button>
          {showQueries && (
            <pre className="op-log" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
              {[data.rising.metadata.esql, data.clusters.metadata.esql]
                .filter(Boolean)
                .join('\n\n')}
            </pre>
          )}
        </>
      )}
    </section>
  )
}
