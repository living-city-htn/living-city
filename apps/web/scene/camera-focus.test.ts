import { describe, expect, it } from 'vitest'
import { focusPose, poseForSelection, type CameraPose } from './camera-focus'

const home: CameraPose = {
  position: [0, 10, 12],
  target: [0, 0, 0],
}

describe('selected-community camera focus', () => {
  it('centres a closer isometric view on the selected community', () => {
    const pose = focusPose(home, [4, -3])
    expect(pose.target).toEqual([4, 0, -3])
    expect(pose.position[0]).toBeCloseTo(4)
    expect(pose.position[1]).toBeCloseTo(5.8)
    expect(pose.position[2]).toBeCloseTo(3.96)
  })

  it('returns to the full-city composition after deselection', () => {
    expect(poseForSelection(home, null)).toEqual(home)
  })
})
