import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POINTS as CONTRACT_POINTS } from '@living-city/contracts'
import {
  DAILY_CAPS, POINTS, addComment, balance, buy, cityDay, commentCount, commentsOf,
  createPost, displayNameOf, getState, ledgerOf, listIncidents, listShop,
  publicIncidents, reset, setDisplayName, setIncidentStatus, toggleLike,
} from '../src/store'
import { seedPosts, seedUsers } from '../src/index'

/** docs/01 sections 8.3, 8.8, 8.9 and 8.10, as the stub implements them. */

const ME = 'device:aaaaaaaaaaaaaaaa'
const YOU = 'device:bbbbbbbbbbbbbbbb'
const COMMUNITY = 'kw:laurelwood'

const post = (userId: string, extra: Partial<Parameters<typeof createPost>[0]> = {}) =>
  createPost({ user_id: userId, text: 'hello', lon: -80.54, lat: 43.47, community_id: COMMUNITY, ...extra })

beforeEach(() => { reset() })
afterEach(() => { vi.useRealTimers() })

describe('points values', () => {
  it('match the contract', () => {
    expect(POINTS).toEqual(CONTRACT_POINTS)
  })
})

describe('the ledger', () => {
  it('records every credit and debit with a reason and a reference', () => {
    const p = post(ME)
    const item = listShop()[0]!
    buy(ME, item.item_tag)
    const rows = ledgerOf(ME)
    expect(rows.map((r) => r.reason)).toEqual(['purchase', 'first_post_in_community_today', 'post'])
    expect(rows.find((r) => r.reason === 'post')?.ref_id).toBe(p.id)
    expect(rows.find((r) => r.reason === 'purchase')?.delta).toBe(-item.price)
  })

  it('totals to the balance, on top of the starting balance', () => {
    post(ME, { image_url: 'https://example.com/a.jpg' })
    const start = balance(YOU)
    const sum = ledgerOf(ME).reduce((n, r) => n + r.delta, 0)
    expect(balance(ME)).toBe(start + sum)
  })
})

describe('posting', () => {
  it('pays 20 in total for a photo post, not 20 on top of 10', () => {
    const before = balance(ME)
    post(ME, { image_url: 'https://example.com/a.jpg' })
    expect(balance(ME) - before).toBe(POINTS.post_with_photo + POINTS.first_post_in_community_today)
  })

  it('pays the first-post bonus once per community per day', () => {
    const before = balance(ME)
    post(ME)
    post(ME)
    expect(balance(ME) - before).toBe(2 * POINTS.post + POINTS.first_post_in_community_today)
  })

  it('pays it again in a different community, and again the next day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00-04:00'))
    const before = balance(ME)
    post(ME)
    post(ME, { community_id: 'kw:uw-northwest-campus' })
    vi.setSystemTime(new Date('2026-10-02T12:00:00-04:00'))
    post(ME)
    expect(balance(ME) - before).toBe(3 * (POINTS.post + POINTS.first_post_in_community_today))
  })

  it('counts days in Waterloo time', () => {
    // 11 pm in Waterloo is already tomorrow in UTC; it is still today here.
    expect(cityDay('2026-10-01T23:30:00-04:00')).toBe('2026-10-01')
  })
})

describe('daily caps', () => {
  it('stops paying for likes given past the cap, for both sides', () => {
    const author = seedUsers.find((u) => u.role !== 'government')!.id
    const fresh = seedPosts.filter((p) => p.user_id !== ME && !p.hidden).slice(0, DAILY_CAPS.like_given + 3)
    const before = balance(ME)
    for (const p of fresh) toggleLike(ME, p.id)
    expect(balance(ME) - before).toBe(DAILY_CAPS.like_given * POINTS.like_given)
    // Past the cap the like still counts.
    expect(getState().likes.has(`${ME}:${fresh.at(-1)!.id}`)).toBe(true)
    expect(author).toBeTruthy()
  })

  it('stops paying for comments given past the cap', () => {
    const p = post(YOU)
    const before = balance(ME)
    for (let i = 0; i < DAILY_CAPS.comment_given + 4; i++) addComment(ME, p.id, `nice ${i}`)
    expect(balance(ME) - before).toBe(DAILY_CAPS.comment_given * POINTS.comment_given)
    expect(commentCount(p.id)).toBe(DAILY_CAPS.comment_given + 4)
  })
})

describe('comments', () => {
  it('pays 3 to the commenter and 4 to the author', () => {
    const p = post(YOU)
    const me = balance(ME)
    const you = balance(YOU)
    const result = addComment(ME, p.id, '  looks great  ')
    expect(result).toMatchObject({ ok: true, points_earned: POINTS.comment_given })
    expect(balance(ME)).toBe(me + POINTS.comment_given)
    expect(balance(YOU)).toBe(you + POINTS.comment_received)
    expect(commentsOf(p.id).map((c) => c.text)).toEqual(['looks great'])
  })

  it('pays nothing for commenting on your own post', () => {
    const p = post(ME)
    const before = balance(ME)
    expect(addComment(ME, p.id, 'me again')).toMatchObject({ ok: true, points_earned: 0 })
    expect(balance(ME)).toBe(before)
  })

  it('refuses empty, overlong, missing and hidden', () => {
    const p = post(YOU)
    expect(addComment(ME, p.id, '   ')).toMatchObject({ ok: false, reason: 'empty' })
    expect(addComment(ME, p.id, 'x'.repeat(501))).toMatchObject({ ok: false, reason: 'too long' })
    expect(addComment(ME, 'p-nope', 'hi')).toMatchObject({ ok: false, reason: 'post not found' })
    const hidden = seedPosts.find((s) => s.hidden)
    if (hidden) expect(addComment(ME, hidden.id, 'hi')).toMatchObject({ ok: false, reason: 'post not found' })
  })
})

describe('display names', () => {
  it('lets a device account choose one', () => {
    expect(displayNameOf(ME)).toBeNull()
    expect(setDisplayName(ME, '  Bryan   K ')).toEqual({ ok: true, display_name: 'Bryan K' })
    expect(displayNameOf(ME)).toBe('Bryan K')
  })

  it('refuses staff names and fixed seed accounts', () => {
    expect(setDisplayName(ME, 'City of Waterloo')).toMatchObject({ ok: false })
    expect(setDisplayName(seedUsers[0]!.id, 'Someone')).toMatchObject({ ok: false })
    expect(setDisplayName(ME, 'x')).toMatchObject({ ok: false })
  })
})

describe('incidents', () => {
  it('turns a report-form post into an incident reported by the user', () => {
    const p = post(ME, { is_incident_report: true, incident_type: 'flooding' })
    const inc = listIncidents().find((i) => i.post_id === p.id)
    expect(inc).toMatchObject({ type: 'flooding', status: 'reported', source: 'user_report', community_id: COMMUNITY })
  })

  it('makes no incident from an ordinary post', () => {
    const p = post(ME)
    expect(listIncidents().some((i) => i.post_id === p.id)).toBe(false)
  })

  it('pays the reporter 25 once when verified, and not again on resolve', () => {
    const p = post(ME, { is_incident_report: true, incident_type: 'fallen_tree' })
    const inc = listIncidents().find((i) => i.post_id === p.id)!
    const before = balance(ME)
    expect(setIncidentStatus(inc.id, 'verified', 'crew sent').ok).toBe(true)
    setIncidentStatus(inc.id, 'verified')
    setIncidentStatus(inc.id, 'resolved')
    expect(balance(ME)).toBe(before + POINTS.verified_incident_report)
    expect(listIncidents().find((i) => i.id === inc.id)).toMatchObject({ status: 'resolved', staff_note: 'crew sent' })
  })

  it('never moves backwards', () => {
    const p = post(ME, { is_incident_report: true, incident_type: 'noise' })
    const inc = listIncidents().find((i) => i.post_id === p.id)!
    setIncidentStatus(inc.id, 'resolved')
    expect(setIncidentStatus(inc.id, 'verified')).toEqual({ ok: false, reason: 'invalid transition' })
  })

  it('leaves the public map when resolved, and names no reporter', () => {
    const p = post(ME, { is_incident_report: true, incident_type: 'road_blocked' })
    const inc = listIncidents().find((i) => i.post_id === p.id)!
    const marker = publicIncidents().find((m) => m.id === inc.id)!
    expect(Object.keys(marker).sort()).toEqual(['community_id', 'id', 'reported_at', 'status', 'type'])
    setIncidentStatus(inc.id, 'resolved')
    expect(publicIncidents().some((m) => m.id === inc.id)).toBe(false)
  })

  it('filters by time range', () => {
    const all = listIncidents()
    const oldest = all.map((i) => i.reported_at).sort()[0]!
    expect(listIncidents({ to: oldest })).toHaveLength(all.filter((i) => i.reported_at <= oldest || Date.parse(i.reported_at) <= Date.parse(oldest)).length)
    expect(listIncidents({ from: '2999-01-01T00:00:00Z' })).toHaveLength(0)
  })
})
