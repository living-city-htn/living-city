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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunityPlan } from '@living-city/fixtures'
import { CityScene, isFallbackScene, type CityPayload, type Placement } from './city'
import PostComposer, { type PostLocation, type PostResult } from './PostComposer'
import ShopPanel from './ShopPanel'
import MyCityPanel from './MyCityPanel'
import TabBar, { type Tab } from './TabBar'
import BlockPanel from './BlockPanel'
import PostList from './PostList'
import { getAllPlans, getCity, getFeed, getMe, getMyPlacements, getShopCatalog, type PostRow } from '@/lib/api'
import { loadMyCity, placeItem, removePlacement, type MyCitySnapshot } from '@/lib/placement'
import type { ShopItem } from '@living-city/fixtures'

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
  const [myCity, setMyCity] = useState<MyCitySnapshot | null>(null)
  const [catalog, setCatalog] = useState<ShopItem[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [placeBusy, setPlaceBusy] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [placeMessage, setPlaceMessage] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const placeInFlight = useRef(false)
  const [sheetHeight, setSheetHeight] = useState(0)

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

  const refreshMyCity = useCallback(async () => {
    if (placeInFlight.current) return
    setPlaceError('')
    setPlaceMessage('')
    try {
      const snapshot = await loadMyCity()
      setMyCity(snapshot)
      setPlacements(snapshot.placements)
      setBalance(snapshot.balance)
      setNeedsRefresh(false)
    } catch {
      setNeedsRefresh(true)
      setPlaceError('Could not load your city. Check your connection and try again.')
    }
  }, [])

  useEffect(() => {
    if (tab !== 'mine') return
    void refreshMyCity()
    if (catalog.length === 0) void getShopCatalog().then(setCatalog).catch(() => {})
  }, [tab, refreshMyCity, catalog.length])

  /**
   * One slot, both directions (PRD 8.12): a filled slot gives the item back, an
   * empty one takes the selected item. A placement write moves a unit between
   * inventory and the slot, so it is never retried automatically.
   */
  const slotTapped = async (communityId: string, slotId: string) => {
    if (tab !== 'mine' || placeInFlight.current || needsRefresh) return
    const existing = myCity?.placements.find(
      (p) => p.community_id === communityId && p.slot_id === slotId,
    )
    if (!existing && !selectedTag) {
      setPlaceMessage('Pick an item below first, then tap a slot.')
      return
    }

    placeInFlight.current = true
    setPlaceBusy(true)
    setPlaceError('')
    setPlaceMessage('')
    try {
      if (existing) {
        if (!existing.id) throw new Error('missing id')
        await removePlacement(existing.id)
        setPlaceMessage('Taken back into your items.')
      } else if (selectedTag) {
        await placeItem(communityId, slotId, selectedTag)
        setPlaceMessage('Placed. Only you can see it.')
      }
      // The server owns inventory and placements, so re-read rather than
      // guessing what the write did.
      const snapshot = await loadMyCity()
      setMyCity(snapshot)
      setPlacements(snapshot.placements)
      setBalance(snapshot.balance)
      if (selectedTag && (snapshot.inventory[selectedTag] ?? 0) === 0) setSelectedTag(null)
    } catch (failure) {
      setNeedsRefresh(true)
      setPlaceError(
        failure instanceof Error ? failure.message : 'That did not go through. Refresh your city.',
      )
    } finally {
      placeInFlight.current = false
      setPlaceBusy(false)
    }
  }

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
    <div className="shell" style={{ ['--sheet-h' as string]: `${Math.round(sheetHeight)}px` }}>
      {/*
        In My City the slots on the map are the touch target (PRD 8.12), so the
        scene's box stops above the sheet instead of running behind it. Any
        scene fills this box, so 3D's component gets the same behaviour without
        a change to its props.
      */}
      <div className="viewport" data-inset={tab === 'mine' && sheetHeight > 0}>
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
            onSlotTap={(communityId, slotId) => void slotTapped(communityId, slotId)}
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
      <ShopPanel active={tab === 'shop'} onBalanceChanged={setBalance} />
      <MyCityPanel
        active={tab === 'mine'}
        snapshot={myCity}
        catalog={catalog}
        selectedTag={selectedTag}
        onSelect={(tag) => {
          setSelectedTag(tag)
          setPlaceMessage('')
        }}
        busy={placeBusy}
        error={placeError}
        message={placeMessage}
        needsRefresh={needsRefresh}
        onRefresh={() => void refreshMyCity()}
        onHeight={setSheetHeight}
      />
      {notice && <div className="post-notice" role="status"><span>{notice}</span><button className="form-button" onClick={() => setNotice('')} aria-label="Dismiss confirmation">Dismiss</button></div>}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
