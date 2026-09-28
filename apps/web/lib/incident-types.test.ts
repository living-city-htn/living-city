import { describe, expect, it } from 'vitest'
import { INCIDENT_TYPE } from '@living-city/contracts'
import { REPORTABLE_INCIDENT_TYPES } from '@living-city/fixtures/store'
import { INCIDENT_LABELS, INCIDENT_TYPES, incidentLabel } from './incident-types'

describe('incident types', () => {
  it('match the store and the contract', () => {
    expect([...INCIDENT_TYPES]).toEqual([...REPORTABLE_INCIDENT_TYPES])
    expect([...INCIDENT_TYPES].sort()).toEqual(INCIDENT_TYPE.filter((t) => t !== 'none').sort())
  })
  it('all have a label, and unknown ones read as Other', () => {
    for (const t of INCIDENT_TYPES) expect(INCIDENT_LABELS[t]).toBeTruthy()
    expect(incidentLabel('meteor')).toBe('Other')
  })
})
