import { beforeEach, describe, expect, it } from 'vitest'
import { createPost, listIncidents, resetDurable } from '@living-city/fixtures/store'
import { DEVICE_HEADER, resetIdentityForTests } from '@/lib/identity'
import { GET as getComments, POST as postComment } from './posts/[id]/comments/route'
import { GET as getMe, PATCH as patchMe } from './me/route'
import { GET as getMarkers } from './incidents/route'
import { PATCH as patchIncident } from './civic/incidents/[id]/route'
import { GET as exportCsv } from './civic/incidents/export/route'
import { GET as getTrends } from './civic/trends/route'

const RESIDENT = 'resident-device-0001'
const OTHER = 'resident-device-0002'
const STAFF = 'government-device'

const req = (device: string, url = 'https://living-city.test/x', init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { [DEVICE_HEADER]: device, 'content-type': 'application/json', ...(init.headers ?? {}) } })
const ctx = <T,>(params: T) => ({ params: Promise.resolve(params) })

beforeEach(async () => {
  resetIdentityForTests(STAFF)
  await resetDurable()
})

const postBy = (device: string, extra: Record<string, unknown> = {}) =>
  createPost({ user_id: `device:${device}`, text: 'Patio is open', lon: -80.54, lat: 43.47, community_id: 'kw:laurelwood', ...extra })

describe('comments', () => {
  it('posts, pays, and lists with the chosen name', async () => {
    const p = postBy(OTHER)
    await patchMe(req(RESIDENT, undefined, { method: 'PATCH', body: JSON.stringify({ display_name: 'Bryan' }) }))
    const created = await postComment(req(RESIDENT, undefined, { method: 'POST', body: JSON.stringify({ text: 'See you there' }) }), ctx({ id: p.id }))
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ points_earned: 3, count: 1, comment: { text: 'See you there', mine: true } })
    const listed = await (await getComments(req(OTHER), ctx({ id: p.id }))).json()
    expect(listed.comments).toEqual([expect.objectContaining({ author_name: 'Bryan', mine: false })])
  })

  it('rejects an empty comment and an unknown post', async () => {
    const p = postBy(OTHER)
    expect((await postComment(req(RESIDENT, undefined, { method: 'POST', body: JSON.stringify({ text: ' ' }) }), ctx({ id: p.id }))).status).toBe(400)
    expect((await postComment(req(RESIDENT, undefined, { method: 'POST', body: JSON.stringify({ text: 'hi' }) }), ctx({ id: 'p-nope' }))).status).toBe(404)
  })
})

describe('display name', () => {
  it('starts unnamed and remembers the choice', async () => {
    expect(await (await getMe(req(RESIDENT))).json()).toMatchObject({ named: false })
    const saved = await patchMe(req(RESIDENT, undefined, { method: 'PATCH', body: JSON.stringify({ display_name: 'Maple Fan' }) }))
    expect(saved.status).toBe(200)
    expect(await (await getMe(req(RESIDENT))).json()).toMatchObject({ named: true, user: { display_name: 'Maple Fan' } })
  })
  it('refuses a staff-looking name', async () => {
    const r = await patchMe(req(RESIDENT, undefined, { method: 'PATCH', body: JSON.stringify({ display_name: 'City of Waterloo Staff' }) }))
    expect(r.status).toBe(400)
  })
})

describe('incidents', () => {
  it('shows an open report on the public map without the reporter, then drops it when resolved', async () => {
    const p = postBy(RESIDENT, { is_incident_report: true, incident_type: 'flooding' })
    const inc = listIncidents().find((i) => i.post_id === p.id)!
    const markers = (await (await getMarkers()).json()).incidents as Array<Record<string, unknown>>
    const mine = markers.find((m) => m.id === inc.id)!
    expect(mine).toMatchObject({ status: 'reported', type: 'flooding' })
    expect(mine).not.toHaveProperty('post_id')

    const resolved = await patchIncident(req(STAFF, undefined, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }), ctx({ id: inc.id }))
    expect(resolved.status).toBe(200)
    const after = (await (await getMarkers()).json()).incidents as Array<{ id: string }>
    expect(after.some((m) => m.id === inc.id)).toBe(false)
  })

  it('keeps the status when only a note is sent, and refuses going backwards', async () => {
    const inc = listIncidents()[0]!
    const noted = await patchIncident(req(STAFF, undefined, { method: 'PATCH', body: JSON.stringify({ staff_note: 'Crew on site' }) }), ctx({ id: inc.id }))
    expect(await noted.json()).toMatchObject({ incident: { status: inc.status, staff_note: 'Crew on site' } })
    await patchIncident(req(STAFF, undefined, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }), ctx({ id: inc.id }))
    const back = await patchIncident(req(STAFF, undefined, { method: 'PATCH', body: JSON.stringify({ status: 'verified' }) }), ctx({ id: inc.id }))
    expect(back.status).toBe(400)
  })

  it('exports the filtered list as CSV, staff only', async () => {
    expect((await exportCsv(req(RESIDENT, 'https://living-city.test/api/civic/incidents/export'))).status).toBe(403)
    const r = await exportCsv(req(STAFF, 'https://living-city.test/api/civic/incidents/export?status=reported'))
    expect(r.headers.get('content-type')).toContain('text/csv')
    const lines = (await r.text()).trim().split('\r\n')
    expect(lines[0]).toMatch(/^id,reported_at,community_id,community,type/)
    expect(lines.length - 1).toBe(listIncidents({ status: 'reported' }).length)
  })

  it('computes trends for staff', async () => {
    expect((await getTrends(req(RESIDENT, 'https://living-city.test/api/civic/trends'))).status).toBe(403)
    postBy(RESIDENT)
    const body = await (await getTrends(req(STAFF, 'https://living-city.test/api/civic/trends?days=7'))).json()
    expect(body.days).toHaveLength(7)
    expect(body.communities.find((c: { community_id: string }) => c.community_id === 'kw:laurelwood').posts).toBeGreaterThan(0)
  })
})
