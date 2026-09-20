/** A camera pose is plain data so selection framing stays easy to test. */
export type CameraPose = {
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * Preserve the overview's isometric angle while moving it closer to one block.
 * The scene owns the animation; this only defines its deterministic endpoints.
 */
export function focusPose(home: CameraPose, origin: [number, number]): CameraPose {
  const target: CameraPose['target'] = [origin[0], home.target[1], origin[1]]
  const zoom = 0.58
  return {
    position: [
      target[0] + (home.position[0] - home.target[0]) * zoom,
      target[1] + (home.position[1] - home.target[1]) * zoom,
      target[2] + (home.position[2] - home.target[2]) * zoom,
    ],
    target,
  }
}

export function poseForSelection(home: CameraPose, origin: [number, number] | null): CameraPose {
  return origin ? focusPose(home, origin) : home
}
