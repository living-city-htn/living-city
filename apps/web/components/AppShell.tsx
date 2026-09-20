'use client'

/**
 * Page destinations share state with the city without sharing its layout.
 * The scene remains mounted to preserve its camera, but hidden scenes are
 * removed from interaction and the accessibility tree. Drafts and in-flight
 * requests remain owned by their existing components.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommunityPlan } from '@living-city/fixtures'
import { CityScene, type CityPayload, type Placement } from './city'
import PostComposer, { type PostLocation, type PostResult } from './PostComposer'
import ShopPanel from './ShopPanel'
import MyCityPanel from './MyCityPanel'
import TabBar, { type Tab } from './TabBar'
import AppHeader from './AppHeader'
import BlockPanel from './BlockPanel'
import FeedPage from './FeedPage'
import CommunityPicker from './CommunityPicker'
import ParticleField from './ParticleField'
import './shell-feedback.css'
import { confirmationPresentation, postFeedback, feedbackMessage, type PostFeedback } from '@/lib/post-feedback'
import './post-confirmation.css'
import { getAllPlans, getCity, getMe, getMyPlacements, getPlan, getShopCatalog } from '@/lib/api'
import { loadMyCity, placeItem, removePlacement, type MyCitySnapshot } from '@/lib/placement'
import { POLL_MS, changedPlanIds, getCityVersion, mergePlans, planIdsOf } from '@/lib/live'

/**
 * How long a block stays marked "planning" before the mark gives up.
 *
 * docs/04 section 8 budgets about 28 seconds from post to rebuild. Past this we
 * stop claiming something is coming, because the alternative is what a
 * rehearsal on the deployed build actually produced: a judge watching a marked
 * block spin forever because nothing replanned it. A stuck mark is worse than
 * no mark — it promises a change the city may never make.
 */
const PLANNING_GIVES_UP_AFTER = 45_000
import type { ShopItem } from '@living-city/fixtures'

const SCREEN_TITLE: Record<Tab, string> = {
  feed: 'Feed', city: 'Explore your city', post: 'New post',
  shop: 'Shop', mine: 'My City',
}

export default function AppShell() {
  const [postLocation, setPostLocation] = useState<PostLocation | null>(null)
  const [pickingLocation, setPickingLocation] = useState(false)
  const [notice, setNotice] = useState<PostFeedback | null>(null)
  const [panelVersion, setPanelVersion] = useState(0)
  const [tab, setTab] = useState<Tab>('city')
  const [city, setCity] = useState<CityPayload | null>(null)
  const [cityError, setCityError] = useState(false)
  const [cityAttempt, setCityAttempt] = useState(0)
  const [plans, setPlans] = useState<CommunityPlan[]>([])
  const [placements, setPlacements] = useState<Placement[]>([])
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
  const planningTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const plansRef = useRef<CommunityPlan[]>([])
  plansRef.current = plans
  const [sheetHeight, setSheetHeight] = useState(0)
  const [planningIds, setPlanningIds] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setCityError(false)
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
    })().catch(() => { if (live) setCityError(true) })
    return () => {
      live = false
    }
  }, [cityAttempt])

  useEffect(() => {
    const timers = planningTimers.current
    return () => { for (const t of Object.values(timers)) clearTimeout(t) }
  }, [])

  /**
   * Live update (docs/02 section 10): poll the cheap version endpoint, re-fetch
   * only the plans whose id changed, and clear the "planning" mark on any block
   * that just got a new plan.
   *
   * It polls unconditionally, including while the tab is hidden. An earlier
   * version paused on `document.hidden` to save a phone's battery, which was an
   * optimisation nobody asked for and a real demo risk: a city view sitting in a
   * background tab while a projector shows it would silently stop updating in
   * the middle of moment 4. The endpoint is a plan-id map, the cost is nothing,
   * and a missed update on stage is everything. `visibilitychange` still forces
   * an immediate poll so a laptop waking from sleep catches up at once.
   */
  useEffect(() => {
    if (!city) return
    let cancelled = false
    let inFlight = false

    const poll = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const version = await getCityVersion()
        if (cancelled) return
        const changed = changedPlanIds(version, planIdsOf(plansRef.current))
        if (changed.length === 0) return
        const fresh = (await Promise.all(changed.map(getPlan))).filter(
          (p): p is CommunityPlan => p !== null,
        )
        if (cancelled || fresh.length === 0) return
        setPlans((current) => mergePlans(current, fresh))
        // The block changed, so whatever we were waiting for has landed.
        const done = new Set(fresh.map((p) => p.community_id))
        for (const id of done) {
          clearTimeout(planningTimers.current[id])
          delete planningTimers.current[id]
        }
        setPlanningIds((ids) => ids.filter((id) => !done.has(id)))
        setNotice(current => current && current.state !== 'hidden' && done.has(current.communityId) ? { ...current, state: 'updated' } : current)
      } catch {
        // A missed poll is not worth telling anyone about; the next one is in
        // five seconds and the city on screen is still valid.
      } finally {
        inFlight = false
      }
    }

    const id = setInterval(() => void poll(), POLL_MS)
    // Catch up at once when a sleeping laptop or a pocketed phone comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [city])

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
    setNotice(postFeedback(result, community?.name ?? 'your community'))
    const marked = result.post.community_id
    // Hidden posts must never promise a public city update.
    if (!result.post.hidden) {
      setPlanningIds(ids => ids.includes(marked) ? ids : [...ids, marked])
      clearTimeout(planningTimers.current[marked])
      planningTimers.current[marked] = setTimeout(() => {
        setPlanningIds(ids => ids.filter(id => id !== marked))
        setNotice(current => current?.communityId === marked && current.state !== 'hidden'
          ? { ...current, state: 'unavailable' } : current)
        delete planningTimers.current[marked]
      }, PLANNING_GIVES_UP_AFTER)
    }
    setSelectedId(result.post.community_id); setPanelVersion(v => v + 1); setTab('city'); setPickingLocation(false)
  }

  const selected = city?.communities.find((c) => c.community_id === selectedId) ?? null
  const mode = tab === 'mine' ? 'mine' : 'public'
  const sceneVisible = tab === 'city' || tab === 'mine' || (tab === 'post' && pickingLocation)

  return (
    <div className="shell" data-screen={tab} data-picking={pickingLocation && tab === 'post'} style={{ ['--sheet-h' as string]: `${Math.round(sheetHeight)}px` }}>
      <AppHeader title={SCREEN_TITLE[tab]} context={tab === 'city' ? 'Tap a neighbourhood to explore' : 'Kitchener–Waterloo'} balance={balance} scene={sceneVisible} />

      <div
        className="viewport"
        role="region"
        data-shown={sceneVisible}
        inert={!sceneVisible}
        aria-label={mode === 'mine' ? 'Your personal city' : 'Community city'}
        data-inset={sheetHeight > 0 && (tab === 'mine' || (tab === 'city' && selected !== null))}
      >
        {city && tab !== 'city' && <CommunityPicker communities={city.communities} selectedId={selectedId} picking={tab === 'post' && pickingLocation}
          onSelect={id => {
            setSelectedId(id)
            if (id && tab === 'post' && pickingLocation) {
              const community = city.communities.find(c => c.community_id === id)
              if (community) {
                setPostLocation({ community_id: id, label: community.name })
                setPickingLocation(false)
              }
            }
          }} />}
        {!city && <div className="scene-state">
          <p role={cityError ? 'alert' : 'status'}>{cityError ? 'Could not load your city. Check your connection and try again.' : 'Opening your city…'}</p>
          {cityError && <button className="form-button" onClick={() => setCityAttempt(v => v + 1)}>Try again</button>}
        </div>}
        <ParticleField />
        <div className="city-layer">
        {city && (
          <CityScene
            city={city}
            plans={plans}
            placements={placements}
            mode={mode}
            selectedId={selectedId}
            planningIds={planningIds}
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
      </div>

      {/*
        City only. In My City a block tap opens its decoration slots rather than
        the public panel (PRD 8.12); placing is Stage 2.
      */}
      {tab === 'city' && selected && (
        <BlockPanel
          key={`${selected.community_id}:${panelVersion}`}
          communityId={selected.community_id}
          name={selected.name}
          planId={plans.find((p) => p.community_id === selected.community_id)?.plan_id}
          onClose={() => setSelectedId(null)}
          onLiked={setBalance}
          onHeight={setSheetHeight}
        />
      )}

      <FeedPage active={tab === 'feed'} communities={city?.communities ?? []} onLiked={setBalance}
        onCommunity={id => { setSelectedId(id); setTab('city') }} />

      {city && (
        <PostComposer
          city={city} active={tab === 'post'} location={postLocation} onLocation={setPostLocation}
          picking={pickingLocation} onPick={setPickingLocation} onPosted={posted}
          onDismiss={() => { setPickingLocation(false); setTab('city') }}
        />
      )}
      {tab === 'post' && !city && <section className="page-screen"><div className="scene-state"><p role={cityError ? 'alert' : 'status'}>{cityError ? 'Could not load communities.' : 'Loading communities…'}</p>{cityError && <button className="form-button" onClick={() => setCityAttempt(v => v + 1)}>Try again</button>}</div></section>}
      <ShopPanel active={tab === 'shop'} onBalanceChanged={setBalance}
        onDecorate={tag => { setSelectedTag(tag); setTab('mine') }} />
      <MyCityPanel
        active={tab === 'mine'}
        onBrowseShop={() => setTab('shop')}
        selectedName={selected?.name}
        slots={city?.slots.filter(slot => slot.community_id === selectedId) ?? []}
        onSlotTap={(communityId, slotId) => void slotTapped(communityId, slotId)}
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
      {notice && <section className="post-confirmation" data-state={notice.state} aria-labelledby="post-confirmation-title">
        <div className="confirmation-copy" role="status">
          <div className="confirmation-title-row">
            <span className="confirmation-status-dot" aria-hidden="true" />
            <p className="confirmation-eyebrow">{confirmationPresentation(notice).eyebrow}</p>
          </div>
          <h2 id="post-confirmation-title">{confirmationPresentation(notice).title}</h2>
          {notice.points !== null && notice.points > 0 && <span className="reward">+{notice.points} points earned</span>}
          <p className="confirmation-detail">{feedbackMessage(notice)}</p>
        </div>
        <div className="confirmation-actions">
          {notice.state !== 'hidden' && <button className="form-button" onClick={() => {
            setSelectedId(notice.communityId); setTab('city'); setNotice(null)
          }}>View on map</button>}
          <button className="form-button" onClick={() => { setTab('shop'); setNotice(null) }}>Visit shop</button>
          <button className="form-button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      </section>}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
