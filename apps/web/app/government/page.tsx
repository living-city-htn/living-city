'use client'

/**
 * The civic desk. docs/01 section 8.9 and user stories 9 to 12 and 15:
 * incidents with their source post, filters by community, type, time and
 * status, verify and resolve with a staff note, CSV export of what the filters
 * show, per-community trends, and the live weather beside the reports so
 * damage can be read against the storm that caused it.
 *
 * Nothing here is written by a model. Trends are arithmetic over the per-post
 * analysis that already drives the city.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { INCIDENT_TYPES, STATUS_LABELS, incidentLabel, type IncidentStatus } from '@/lib/incident-types'
import type { IncidentRow } from '@/lib/civic'
import type { CommunityTrend } from '@/lib/trends'
import type { WeatherReport } from '@/lib/api'

type Filters = { community: string; type: string; status: string; range: string }
const NO_FILTERS: Filters = { community: '', type: '', status: '', range: 'all' }

const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))

const query = (f: Filters) => {
  const q = new URLSearchParams()
  if (f.community) q.set('community', f.community)
  if (f.type) q.set('type', f.type)
  if (f.status) q.set('status', f.status)
  if (f.range !== 'all') q.set('range', f.range)
  return q.toString()
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Request failed')
  return body
}

export default function GovernmentPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [communities, setCommunities] = useState<Array<{ id: string; name: string }>>([])
  const [trends, setTrends] = useState<CommunityTrend[] | null>(null)
  const [trendDays, setTrendDays] = useState(30)
  const [weather, setWeather] = useState<WeatherReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const body = await send<{ incidents: IncidentRow[] }>(`/api/civic/incidents?${query(filters)}`)
      setIncidents(body.incidents)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load incidents')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    send<{ communities: Array<{ community_id: string; name: string }> }>('/api/city')
      .then((c) => setCommunities(c.communities.map((x) => ({ id: x.community_id, name: x.name }))
        .sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
    send<{ weather: WeatherReport | null }>('/api/weather').then((w) => setWeather(w.weather)).catch(() => {})
  }, [])

  useEffect(() => {
    setTrends(null)
    send<{ communities: CommunityTrend[] }>(`/api/civic/trends?days=${trendDays}`)
      .then((t) => setTrends(t.communities))
      .catch(() => setTrends([]))
  }, [trendDays])

  const act = async (incident: IncidentRow, body: { status?: 'verified' | 'resolved'; staff_note?: string }) => {
    if (busy) return
    setBusy(incident.id)
    setError('')
    try {
      await send(`/api/civic/incidents/${encodeURIComponent(incident.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      await load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Action could not be completed')
    } finally {
      setBusy('')
    }
  }

  const hide = async (incident: IncidentRow) => {
    if (busy) return
    setBusy(incident.id)
    try {
      await send(`/api/posts/${encodeURIComponent(incident.post_id)}/hide`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'operator' }),
      })
      await load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Action could not be completed')
    } finally {
      setBusy('')
    }
  }

  const counts = useMemo(() => {
    const c: Record<IncidentStatus, number> = { reported: 0, verified: 0, resolved: 0 }
    for (const i of incidents) c[i.status] += 1
    return c
  }, [incidents])

  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }))

  return (
    <main className="gov-page">
      <header className="gov-head">
        <div>
          <p className="gov-kicker">Civic desk</p>
          <h1>Signals from the city</h1>
          <p className="gov-lede">What residents report, verified by staff. Summaries are computed, not written.</p>
        </div>
        <button className="op-btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {weather && (
        <section className="gov-weather" aria-label="Current weather">
          <span className="weather-dot" aria-hidden="true" style={{ background: weather.sky[0] }} />
          <strong>{weather.label}</strong>
          {weather.temperature_c !== null && <span>{Math.round(weather.temperature_c)}°C</span>}
          <span className="gov-weather-note">
            Kitchener–Waterloo now · {weather.source === 'override' ? 'rehearsal override' : 'Open-Meteo'}
          </span>
        </section>
      )}

      <section className="gov-filters" aria-label="Filter incidents">
        <label>
          <span>Community</span>
          <select value={filters.community} onChange={(e) => set('community')(e.target.value)}>
            <option value="">All communities</option>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select value={filters.type} onChange={(e) => set('type')(e.target.value)}>
            <option value="">All types</option>
            {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{incidentLabel(t)}</option>)}
          </select>
        </label>
        <label>
          <span>Time</span>
          <select value={filters.range} onChange={(e) => set('range')(e.target.value)}>
            <option value="all">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="">Any status</option>
            <option value="reported">Unverified</option>
            <option value="verified">Verified</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <div className="gov-filter-actions">
          <button className="op-btn" onClick={() => setFilters(NO_FILTERS)} disabled={query(filters) === ''}>Clear</button>
          <a className="op-btn" href={`/api/civic/incidents/export?${query(filters)}`} download>Export CSV</a>
        </div>
      </section>

      {error && (
        <div className="gov-alert" role="alert">
          <strong>Something went wrong.</strong>
          <span>{error}</span>
        </div>
      )}

      {!error && (
        <p className="gov-summary" role="status">
          {loading ? 'Loading incident reports…'
            : `${incidents.length} ${incidents.length === 1 ? 'incident' : 'incidents'} · ${counts.reported} unverified · ${counts.verified} verified · ${counts.resolved} resolved`}
        </p>
      )}

      {!error && !loading && incidents.length === 0 && (
        <p className="gov-state">No incidents match these filters.</p>
      )}
      {incidents.length > 0 && (
        <ul className="gov-list" aria-label="Incident reports">
          {incidents.map((incident) => (
            <li className="gov-card" key={incident.id}>
              {incident.post?.image_url
                ? <img className="gov-thumb" src={incident.post.image_url} alt="" loading="lazy" />
                : <div className="gov-thumb gov-thumb-empty" aria-hidden="true">No photo</div>}
              <div className="gov-card-body">
                <div className="gov-card-top">
                  <div>
                    <p className="gov-type">{incidentLabel(incident.type)}</p>
                    <p className="gov-community">{incident.community_name}</p>
                  </div>
                  <span className={`gov-status gov-status-${incident.status}`}>{STATUS_LABELS[incident.status]}</span>
                </div>
                <p className="gov-post">{incident.post?.text || 'The source post is no longer available.'}</p>
                <dl className="gov-meta">
                  <div><dt>Reported</dt><dd>{formatTime(incident.reported_at)}</dd></div>
                  <div><dt>Severity</dt><dd>{incident.severity}/3</dd></div>
                  <div><dt>Source</dt><dd>{incident.source === 'user_report' ? 'Report form' : 'Post'}</dd></div>
                  <div><dt>Reporter</dt><dd>Anonymous resident</dd></div>
                  {incident.location_hint && <div><dt>Location</dt><dd>{incident.location_hint}</dd></div>}
                  {incident.staff_note && <div className="gov-meta-wide"><dt>Staff note</dt><dd>{incident.staff_note}</dd></div>}
                </dl>
                <div className="gov-note">
                  <label className="sr-only" htmlFor={`note-${incident.id}`}>Staff note</label>
                  <input
                    id={`note-${incident.id}`}
                    placeholder="Add a staff note"
                    maxLength={500}
                    value={notes[incident.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [incident.id]: e.target.value }))}
                  />
                  <button className="op-btn op-btn-sm" disabled={busy !== '' || !(notes[incident.id] ?? '').trim()}
                    onClick={() => void act(incident, { staff_note: notes[incident.id]! }).then(() => setNotes((n) => ({ ...n, [incident.id]: '' })))}>
                    Save note
                  </button>
                </div>
                <div className="gov-actions">
                  <button className="op-btn" data-tone="go" disabled={busy !== '' || incident.status !== 'reported'}
                    onClick={() => void act(incident, { status: 'verified' })}>
                    {incident.status === 'reported' ? 'Verify' : 'Verified'}
                  </button>
                  <button className="op-btn" disabled={busy !== '' || incident.status === 'resolved'}
                    onClick={() => void act(incident, { status: 'resolved' })}>
                    {incident.status === 'resolved' ? 'Resolved' : 'Mark resolved'}
                  </button>
                  <button className="op-btn" data-tone="warn" disabled={busy !== ''} onClick={() => void hide(incident)}>
                    Hide post
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="gov-trends" aria-labelledby="trends-title">
        <div className="gov-trends-head">
          <div>
            <h2 id="trends-title">Community trends</h2>
            <p className="gov-lede">Posts per day, mean mood (valence, −100 to 100) and the strongest signals, from the same analysis that drives the city.</p>
          </div>
          <label>
            <span className="sr-only">Trend window</span>
            <select value={trendDays} onChange={(e) => setTrendDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
        {trends === null && <p className="gov-state" role="status">Computing trends…</p>}
        {trends && trends.every((t) => t.posts === 0) && <p className="gov-state">No posts in this window.</p>}
        {trends && trends.some((t) => t.posts > 0) && (
          <ul className="trend-list">
            {trends.filter((t) => t.posts > 0).map((t) => <TrendRow key={t.community_id} trend={t} />)}
          </ul>
        )}
      </section>
    </main>
  )
}

/** One community: a volume column chart, then mood and signals as text. */
function TrendRow({ trend }: { trend: CommunityTrend }) {
  const max = Math.max(1, ...trend.daily.map((d) => d.posts))
  const W = 240
  const H = 44
  const gap = 2
  const bar = Math.max(1, (W - gap * (trend.daily.length - 1)) / trend.daily.length)
  const change = trend.valence_change
  return (
    <li className="trend-row">
      <div className="trend-name">
        <strong>{trend.name}</strong>
        {trend.mood && <span className="trend-mood">{trend.mood}</span>}
      </div>
      <figure className="trend-chart">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
          aria-label={`${trend.name}: ${trend.posts} posts over ${trend.daily.length} days`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="trend-axis" />
          {trend.daily.map((d, i) => {
            const h = d.posts === 0 ? 0 : Math.max(3, (d.posts / max) * (H - 4))
            return (
              <g key={d.day}>
                {/* Hit target taller than the mark, so a thin bar is still easy to hover. */}
                <rect x={i * (bar + gap)} y={0} width={bar} height={H} fill="transparent">
                  <title>{`${d.day}: ${d.posts} ${d.posts === 1 ? 'post' : 'posts'}${d.valence !== null ? `, mood ${d.valence}` : ''}`}</title>
                </rect>
                {h > 0 && <rect x={i * (bar + gap)} y={H - h} width={bar} height={h} rx={Math.min(2, bar / 2)} className="trend-bar" pointerEvents="none" />}
              </g>
            )
          })}
        </svg>
        <figcaption className="sr-only">Posts per day</figcaption>
      </figure>
      <dl className="trend-stats">
        <div><dt>Posts</dt><dd>{trend.posts}</dd></div>
        <div><dt>Mood</dt><dd>
          {trend.valence === null ? '—' : trend.valence}
          {change !== null && change !== 0 && (
            <span className="trend-change" data-dir={change > 0 ? 'up' : 'down'}>
              {change > 0 ? ' ▲' : ' ▼'} {Math.abs(change)}
            </span>
          )}
        </dd></div>
        <div className="trend-wide"><dt>Signals</dt><dd>
          {trend.dimensions.length ? trend.dimensions.map((d) => `${d.name} ${Math.round(d.value)}`).join(' · ') : '—'}
        </dd></div>
        <div className="trend-wide"><dt>Top tags</dt><dd>
          {trend.top_tags.length ? trend.top_tags.map((t) => `${t.tag.replace(/_/g, ' ')} (${t.count})`).join(', ') : '—'}
        </dd></div>
      </dl>
      {trend.analysed < trend.posts && (
        <p className="trend-note">Mood from {trend.analysed} of {trend.posts} posts; the rest are counted in volume only.</p>
      )}
    </li>
  )
}
