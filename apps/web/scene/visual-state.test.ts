import { describe, expect, it } from 'vitest'
import { blockVisualState, PLANNING_GROUND } from './visual-state'

describe('blockVisualState', () => {
  it('marks a pending post with a cool planning surface and outline', () => {
    expect(blockVisualState('serene', true)).toEqual({
      ground: PLANNING_GROUND,
      showFestivalGlow: false,
      showPlanningOutline: true,
    })
  })

  it('makes an approved festive plan warm without a planning outline', () => {
    expect(blockVisualState('festive', false)).toEqual({
      ground: null,
      showFestivalGlow: true,
      showPlanningOutline: false,
    })
  })
})
