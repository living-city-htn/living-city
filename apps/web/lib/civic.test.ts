import { describe, expect, it } from 'vitest'
import { csvField, filtersFrom, incidentsCsv, type IncidentRow } from './civic'

const row = (over: Partial<IncidentRow> = {}): IncidentRow => ({
  id: 'inc-001', post_id: 'p-1', community_id: 'kw:x', community_name: 'Uptown',
  type: 'fallen_tree', severity: 2, location_hint: null, reported_at: '2026-09-18T11:35:00.000Z',
  source: 'post', status: 'reported', staff_note: null, updated_at: '2026-09-18T11:35:00.000Z',
  post: { text: 'Tree down, "big" one, on King', image_url: null }, ...over,
})

describe('filtersFrom', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')
  it('turns a range into a from bound', () => {
    expect(filtersFrom(new URLSearchParams('range=24h'), now).from).toBe('2026-09-26T12:00:00.000Z')
  })
  it('lets an explicit from win and ignores junk dates', () => {
    const f = filtersFrom(new URLSearchParams('range=7d&from=2026-09-01&to=nope&status=verified'), now)
    expect(f.from).toBe('2026-09-01T00:00:00.000Z')
    expect(f.to).toBeUndefined()
    expect(f.status).toBe('verified')
  })
  it('treats empty values as no filter', () => {
    expect(filtersFrom(new URLSearchParams('community=&type='), now)).toMatchObject({ community: undefined, type: undefined })
  })
})

describe('CSV', () => {
  it('quotes commas and quotes, and uses labels', () => {
    const csv = incidentsCsv([row()])
    const [head, line] = csv.split('\r\n')
    expect(head!.startsWith('id,reported_at,community_id,community,type')).toBe(true)
    expect(line).toContain('"Tree down, ""big"" one, on King"')
    expect(line).toContain('Fallen tree')
    expect(line).toContain('Unverified')
  })
  it('defuses spreadsheet formulas', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('-1')).toBe(`'-1`)
    expect(csvField(-1)).toBe('-1')
  })
  it('does not dump inline photos into the file', () => {
    expect(incidentsCsv([row({ post: { text: 'x', image_url: 'data:image/jpeg;base64,AAAA' } })])).toContain('(inline photo)')
  })
  it('has a header even when nothing matches', () => {
    expect(incidentsCsv([]).split('\r\n').filter(Boolean)).toHaveLength(1)
  })
})
