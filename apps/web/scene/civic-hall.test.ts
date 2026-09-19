import { describe, expect, it } from 'vitest'
import type { Cell } from '@living-city/modeling'
import { civicHallCellIndex, isCivicHallDrill } from './civic-hall'

const cells: Cell[] = [
  { x: 8, y: 8, size: 4, kind: 'building', category: 'office', storeys: 4, variant: 0.4 },
  { x: 1, y: -1, size: 4, kind: 'building', category: 'retail', storeys: 2, variant: 0.2 },
  { x: 0, y: 0, size: 4, kind: 'plaza', variant: 0.6 },
]

describe('City Hall landmark', () => {
  it('reserves the central generated building only in the civic community', () => {
    expect(civicHallCellIndex('kw:central', cells)).toBe(1)
    expect(civicHallCellIndex('kw:columbia', cells)).toBe(-1)
  })

  it('activates the tornado drill only while City Hall is selected', () => {
    expect(isCivicHallDrill('kw:central', 'selected')).toBe(true)
    expect(isCivicHallDrill('kw:central', 'idle')).toBe(false)
    expect(isCivicHallDrill('kw:columbia', 'selected')).toBe(false)
  })
})
