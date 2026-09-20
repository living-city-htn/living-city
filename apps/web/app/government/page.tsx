'use client'

import { useCallback, useEffect, useState } from 'react'

type IncidentRow = {
  id: string
  post_id: string
  community_id: string
  type: string
  severity: 0 | 1 | 2 | 3
  location_hint: string | null
  reported_at: string
  status: 'reported' | 'verified'
  staff_note: string | null
  post: { text: string; image_url: string | null } | null
}

const TYPE_LABELS: Record<string, string> = {
  flooding: 'Flooding',
  fallen_tree: 'Fallen tree',
  road_blocked: 'Road blocked',
  power_outage: 'Power outage',
}

const typeLabel = (type: string) => TYPE_LABELS[type] ?? 'Other'

const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

export default function GovernmentPage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/civic/incidents', { cache: 'no-store' })
      const body = await response.json() as { incidents?: IncidentRow[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not load incidents')
      setIncidents(body.incidents ?? [])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load incidents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (id: string, action: 'verify' | 'hide') => {
    if (busy) return
    setBusy(`${action}:${id}`)
    setError('')
    try {
      const endpoint = action === 'verify'
        ? `/api/civic/incidents/${encodeURIComponent(id)}`
        : `/api/posts/${encodeURIComponent(id)}/hide`
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'verify' ? { status: 'verified' } : { reason: 'operator' }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Action could not be completed')
      await load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Action could not be completed')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="gov-page">
      <header className="gov-head">
        <div>
          <p className="gov-kicker">Civic desk</p>
          <h1>Signals from the city</h1>
          <p className="gov-lede">Review reported incidents before they become part of the public record.</p>
        </div>
        <button className="op-btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="gov-alert" role="alert">
          <strong>Government access needed.</strong>
          <span>{error}</span>
        </div>
      )}

      {!error && loading && <p className="gov-state" role="status">Loading incident reports…</p>}
      {!error && !loading && incidents.length === 0 && (
        <p className="gov-state" role="status">No visible incidents right now.</p>
      )}
      {!error && !loading && incidents.length > 0 && (
        <ul className="gov-list" aria-label="Incident reports">
          {incidents.map((incident) => (
            <li className="gov-card" key={incident.id}>
              {incident.post?.image_url && (
                <img className="gov-thumb" src={incident.post.image_url} alt="" loading="lazy" />
              )}
              <div className="gov-card-body">
                <div className="gov-card-top">
                  <div>
                    <p className="gov-type">{typeLabel(incident.type)}</p>
                    <p className="gov-community">{incident.community_id}</p>
                  </div>
                  <span className={`gov-status gov-status-${incident.status}`}>{incident.status}</span>
                </div>
                <p className="gov-post">{incident.post?.text ?? 'The source post is no longer available.'}</p>
                <dl className="gov-meta">
                  <div><dt>Reported</dt><dd>{formatTime(incident.reported_at)}</dd></div>
                  <div><dt>Severity</dt><dd>{incident.severity}/3</dd></div>
                  {incident.location_hint && <div><dt>Location</dt><dd>{incident.location_hint}</dd></div>}
                </dl>
                <div className="gov-actions">
                  <button
                    className="op-btn"
                    disabled={busy !== '' || incident.status === 'verified'}
                    onClick={() => void act(incident.id, 'verify')}
                  >
                    {incident.status === 'verified' ? 'Verified' : 'Verify report'}
                  </button>
                  <button
                    className="op-btn"
                    data-tone="warn"
                    disabled={busy !== ''}
                    onClick={() => void act(incident.post_id, 'hide')}
                  >
                    Hide post
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
