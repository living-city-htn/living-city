import { describe, expect, it } from 'vitest'
import { incident } from '@living-city/contracts'
import incidents from '../../fixtures/data/incidents.mock.json'

describe('the Civic incident fixture', () => {
  it('provides three contract-valid incidents across the two supported statuses', () => {
    const records = incident.array().parse(incidents.incidents)

    expect(records).toHaveLength(3)
    expect(records.filter((record) => record.status === 'reported')).toHaveLength(2)
    expect(records.filter((record) => record.status === 'verified')).toHaveLength(1)
    expect(records.map((record) => record.type)).toEqual([
      'fallen_tree',
      'power_outage',
      'flooding',
    ])
  })
})
