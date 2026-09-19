import type { Cell } from '@living-city/modeling'

export const CIVIC_HALL_COMMUNITY_ID = 'kw:central'

export function civicHallCellIndex(communityId: string, cells: readonly Cell[]) {
  if (communityId !== CIVIC_HALL_COMMUNITY_ID) return -1
  let closest = -1
  let distance = Number.POSITIVE_INFINITY
  cells.forEach((cell, index) => {
    if (cell.kind !== 'building') return
    const nextDistance = cell.x ** 2 + cell.y ** 2
    if (nextDistance < distance) {
      closest = index
      distance = nextDistance
    }
  })
  return closest
}

export function isCivicHallDrill(communityId: string, state: 'idle' | 'hovered' | 'selected') {
  return communityId === CIVIC_HALL_COMMUNITY_ID && state === 'selected'
}
