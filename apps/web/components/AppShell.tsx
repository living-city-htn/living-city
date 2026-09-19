'use client'

/**
 * One screen, five tabs, the map always underneath (apps/web/DESIGN.md,
 * "Screen structure").
 *
 * The scene stays mounted across every tab: it is the most expensive thing on
 * the page, it holds the camera, and DESIGN.md wants the city visible behind
 * the sheets rather than replaced by them.
 *
 * All state lives here. The scene renders it and never owns it (docs/02
 * section 4.5), which is also what lets 3D's component drop into the same
 * props without touching this file.
 */
import { useEffect, useState } from 'react'
import type { CommunityPlan } from '@living-city/fixtures'
import { CityScene, isFallbackScene, type CityPayload, type Placement } from './city'
import PostComposer, { type PostLocation, type PostResult } from './PostComposer'
import TabBar, { type Tab } from './TabBar'
import BlockPanel from './BlockPanel'
import PostList from './PostList'
import { getAllPlans, getCity, getFeed, getMe, getMyPlacements, type PostRow } from '@/lib/api'

export default function AppShell() {
  const [postLocation, setPostLocation] = useState<PostLocation | null>(null)
  const [pickingLocation, setPickingLocation] = useState(false)
  const [notice, setNotice] = useState('')
  const [panelVersion, setPanelVersion] = useState(0)
  const [tab, setTab] = useState<Tab>('city')
  const [city, setCity] = useState<CityPayload | null>(null)
  const [plans, setPlans] = useState<CommunityPlan[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])
  const [feed, setFeed] = useState<PostRow[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const payload = await getCity()
      if (!live) return
      setCity(payload)

      const [loadedPlans, mine, me] = await Promise.all([
        getAllPlans(payload.communities.map((c) => c.community_id)),
        getMyPlacements().catch(() => []),
        getMe().catch(() => null),
      ])
      if (!live) return
      setPlans(loadedPlans)
      setPlacements(mine)
      setBalance(me?.balance ?? null)
    })().catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // The feed is the one tab whose data can change while you are away from it.
  useEffect(() => {
    if (tab !== 'feed') return
    let live = true
    getFeed()
      .then((posts) => live && setFeed(posts))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [tab])

  const posted = (result: PostResult) => {
    const community = city?.communities.find(c => c.community_id === result.post.community_id)
    if (typeof result.balance === 'number') setBalance(result.balance)
    else void getMe().then(me => setBalance(me.balance)).catch(() => {})
    const points = typeof result.points_earned === 'number' ? ` +${result.points_earned} points.` : ''
    setNotice(result.post.hidden ? 'Post received but not shown publicly.' :
      `Posted to ${community?.name ?? 'your community'}.${points}${result.post.status === 'pending' ? ' Being analyzed.' : ''}`)
    setSelectedId(result.post.community_id); setPanelVersion(v => v + 1); setTab('city'); setPickingLocation(false)
  }

  const selected = city?.communities.find((c) => c.community_id === selectedId) ?? null
  const mode = tab === 'mine' ? 'mine' : 'public'

  return (
    <div className="shell">
      <div className="viewport">
        {city && (
          <CityScene
            city={city}
            plans={plans}
            placements={placements}
            mode={mode}
            selectedId={selectedId}
            planningIds={[]}
            onBlockSelect={setSelectedId}
            onBlockPick={(id, point) => {
              if (tab !== 'post' || !pickingLocation) return
              const community = city.communities.find(c => c.community_id === id)
              setPostLocation({ community_id: id, lon: point[0], lat: point[1], label: community?.name ?? id })
              setPickingLocation(false)
            }}
            onSlotTap={() => {
              /* Placing is Stage 2: my-city mode with persistence. */
            }}
          />
        )}
      </div>

      {tab === 'city' && !selected && (
        <div className="greeting">
          <h1>Hello, welcome to Kitchener-Waterloo</h1>
          <p>
            {isFallbackScene ? 'Flat outlines — the 3D city lands soon.' : 'Tap a block to see what it feels like.'}
          </p>
        </div>
      )}

      {/*
        City only. In My City a block tap opens its decoration slots rather than
        the public panel (PRD 8.12); placing is Stage 2.
      */}
      {tab === 'city' && selected && (
        <BlockPanel
          key={`${selected.community_id}:${panelVersion}`}
          communityId={selected.community_id}
          name={selected.name}
          onClose={() => setSelectedId(null)}
          onLiked={setBalance}
        />
      )}

      {tab === 'feed' && (
        <section className="sheet" aria-label="Feed">
          <header className="sheet-head">
            <div>
              <h2>Feed</h2>
              <p className="sheet-sub">Everything happening across the city</p>
            </div>
            {balance !== null && <span className="balance">{balance} pts</span>}
          </header>
          <div className="sheet-body">
            <PostList posts={feed} onLiked={setBalance} empty="No posts yet." />
          </div>
        </section>
      )}

      {city && <PostComposer city={city} active={tab === 'post'} location={postLocation} onLocation={setPostLocation}
        picking={pickingLocation} onPick={setPickingLocation} onPosted={posted} />}
      {tab === 'post' && !city && <section className="sheet"><header className="sheet-head"><p role="status">Loading communities. If this takes too long, reload the page.</p></header></section>}
      {tab === 'shop' && <section className="sheet" aria-label="Shop"><header className="sheet-head"><div><h2>Shop</h2><p className="sheet-sub">Six items and your balance — next up.</p></div>{balance !== null && <span className="balance">{balance} pts</span>}</header></section>}
      {notice && <div className="post-notice" role="status"><span>{notice}</span><button className="form-button" onClick={() => setNotice('')} aria-label="Dismiss confirmation">Dismiss</button></div>}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
