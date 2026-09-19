/** Disposable 2D camera math. Coordinates remain in the fallback projection. */
export type Camera = { x: number; y: number; width: number; height: number }
export function containCity(width: number, height: number): Camera {
  return { x: -width * .12, y: -height * .12, width: width * 1.24, height: height * 1.24 }
}
export function constrainCamera(camera: Camera, bounds: Camera): Camera {
  const width = Math.max(bounds.width / 4, Math.min(bounds.width, camera.width))
  const height = width * bounds.height / bounds.width
  return { width, height, x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, camera.x)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, camera.y)) }
}
/** Keep the world point under the gesture anchor stationary while zooming. */
export function zoomCamera(camera: Camera, bounds: Camera, factor: number, anchor: { x: number; y: number }): Camera {
  const width = Math.max(bounds.width / 4, Math.min(bounds.width, camera.width / factor))
  const ratio = width / camera.width
  return constrainCamera({ x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio, width, height: camera.height * ratio }, bounds)
}
