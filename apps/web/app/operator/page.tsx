'use client'

/**
 * The operator panel. Not a tab: judges never see this, so it stays off the
 * five-tab bar (apps/web/DESIGN.md) at its own route.
 *
 * Its most important job is the ticker. There is no long-running process on
 * Vercel, so nothing replans blocks unless this page is open calling
 * POST /api/plan/tick every ten seconds (docs/04 section 7). Closing the page
 * is the intended off switch, which is why the page says so out loud.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_COMMUNITY_ID, type CommunityGeo } from '@living-city/fixtures'
import { getCity, getFeed, type PostRow } from '@/lib/api'
import {
  getQrPaused, getVersion, hidePost, planAll, planOne, presetFestival, resetDemo,
  setQrPaused, tick, type CityVersion,
} from '@/lib/operator'
import SignalPanel from '@/components/SignalPanel'

const TICK_MS = 10_000

export default function OperatorPage() {
  const [communities, setCommunities] = useState<CommunityGeo[]>([])
  const [version, setVersion] = useState<CityVersion | null>(null)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [ticking, setTicking] = useState(true)
  const [lastTick, setLastTick] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [qrPaused, setQrPausedState] = useState<boolean | null>(null)
  const tickInFlight = useRef(false)

  const note = useCallback((line: string) => {
    const at = new Date().toLocaleTimeString([], { hour12: false })
    setLog((l) => [`${at}  ${line}`, ...l].slice(0, 12))
  }, [])

  const loadPosts = useCallback(() => {
    getFeed()
      .then((p) => setPosts(p.slice(0, 12)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    getCity().then((c) => setCommunities(c.communities)).catch(() => {})
    getVersion().then(setVersion).catch(() => {})
    getQrPaused().then(setQrPausedState).catch(() => {})
    loadPosts()
  }, [loadPosts])

  // The ticker. Skips its turn rather than stacking if one is still in flight.
  useEffect(() => {
    if (!ticking) return
    let cancelled = false
    const run = async () => {
      if (tickInFlight.current) return
      tickInFlight.current = true
      try {
        const result = await tick()
        if (cancelled) return
        setVersion(result.version)
        setLastTick(new Date().toLocaleTimeString([], { hour12: false }))
        if (result.replanned.length > 0) note(`tick replanned ${result.replanned.join(', ')}`)
      } catch {
        if (!cancelled) note('tick failed — check the network, the demo still runs')
      } finally {
        tickInFlight.current = false
      }
    }
    void run()
    const id = setInterval(() => void run(), TICK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ticking, note])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(label)
    try {
      await fn()
      note(`${label} ok`)
      setVersion(await getVersion().catch(() => version as CityVersion))
    } catch (failure) {
      note(`${label} FAILED — ${failure instanceof Error ? failure.message : 'unknown'}`)
    } finally {
      setBusy('')
    }
  }

  const demo = communities.find((c) => c.community_id === DEMO_COMMUNITY_ID)

  return (
    <main className="op">
      <header className="op-head">
        <h1>Operator</h1>
        <p className={ticking ? 'op-live' : 'op-dead'}>
          {ticking
            ? `Ticker on — replanning changed blocks every ${TICK_MS / 1000}s${lastTick ? `, last ${lastTick}` : ''}`
            : 'Ticker OFF — nothing is replanning'}
        </p>
      </header>

      <section className="op-card op-ticker">
        <div>
          <h2>Planning ticker</h2>
          <p>
            Nothing replans unless this page is open. Keep it open and keep the laptop
            awake for moment 8.
          </p>
        </div>
        <button
          className="op-btn"
          data-tone={ticking ? 'warn' : 'go'}
          onClick={() => {
            setTicking((t) => !t)
            note(ticking ? 'ticker stopped' : 'ticker started')
          }}
        >
          {ticking ? 'Stop ticker' : 'Start ticker'}
        </button>
      </section>

      <section className="op-card">
        <h2>Moment 4</h2>
        <div className="op-row">
          <button
            className="op-btn"
            data-tone="go"
            disabled={busy !== '' || !demo}
            onClick={() => void act(`preset festival plan on ${demo?.name ?? 'demo block'}`,
              () => presetFestival(DEMO_COMMUNITY_ID))}
          >
            Preset festival plan{demo ? ` — ${demo.name}` : ''}
          </button>
          <button className="op-btn" disabled={busy !== ''}
            onClick={() => void act('replan all', planAll)}>
            Replan all blocks
          </button>
        </div>
        <p className="op-hint">
          Press the preset if a real plan comes back flat on stage, then keep talking.
        </p>
      </section>

      <section className="op-card op-ticker">
        <div>
          <h2>QR page</h2>
          <p>
            {qrPaused === null
              ? 'Checking whether the QR page is inviting posts…'
              : qrPaused
                ? 'Paused — the QR page is not inviting new posts.'
                : 'Live — judges scanning it can post.'}
          </p>
          <p className="op-hint">
            Volume only. The fuse for a bad post is Hide, below. A reset starts unpaused.
          </p>
        </div>
        <button
          className="op-btn"
          data-tone={qrPaused ? 'go' : 'warn'}
          disabled={busy !== '' || qrPaused === null}
          onClick={() => void act(qrPaused ? 'resume QR page' : 'pause QR page', async () => {
            setQrPausedState(await setQrPaused(!qrPaused))
          })}
        >
          {qrPaused ? 'Resume QR page' : 'Pause QR page'}
        </button>
      </section>

      <section className="op-card">
        <h2>Blocks</h2>
        <ul className="op-blocks">
          {communities.map((c) => (
            <li key={c.community_id}>
              <span className="op-block-name">{c.name}</span>
              <code>{version?.plans[c.community_id] ?? '—'}</code>
              <button className="op-btn op-btn-sm" disabled={busy !== ''}
                onClick={() => void act(`replan ${c.name}`, () => planOne(c.community_id))}>
                Replan
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="op-card">
        <div className="op-row op-row-spread">
          <h2>Latest posts</h2>
          <button className="op-btn op-btn-sm" onClick={loadPosts}>Refresh</button>
        </div>
        <p className="op-hint">Hiding removes a post from every feed, the panel, aggregation and the government page.</p>
        <ul className="op-posts">
          {posts.length === 0 && <li className="op-hint">No visible posts.</li>}
          {posts.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.author_name}</strong> <span className="op-hint">{p.community_id}</span>
                <p>{p.text}</p>
              </div>
              <button className="op-btn op-btn-sm" data-tone="warn" disabled={busy !== ''}
                onClick={() => void act(`hide ${p.id}`, async () => {
                  await hidePost(p.id)
                  loadPosts()
                })}>
                Hide
              </button>
            </li>
          ))}
        </ul>
      </section>

      <SignalPanel />

      <section className="op-card">
        <h2>Reset</h2>
        <p className="op-hint">
          Puts posts, plans, balances, placements and incidents back to their seeded state.
          Everything a judge did is lost.
        </p>
        {confirmReset ? (
          <div className="op-row">
            <button className="op-btn" data-tone="danger" disabled={busy !== ''}
              onClick={() => {
                setConfirmReset(false)
                void act('reset demo', async () => {
                  setVersion(await resetDemo())
                  loadPosts()
                })
              }}>
              Yes, reset everything
            </button>
            <button className="op-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        ) : (
          <button className="op-btn" data-tone="danger" onClick={() => setConfirmReset(true)}>
            Reset the demo…
          </button>
        )}
      </section>

      <section className="op-card">
        <h2>Log</h2>
        <ul className="op-log">
          {log.length === 0 && <li className="op-hint">Nothing yet.</li>}
          {log.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
        </ul>
      </section>
    </main>
  )
}
