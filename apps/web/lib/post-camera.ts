type MediaDevicesLike = { getUserMedia?: unknown }
type CameraFailure = { name?: unknown }

export function canUseLiveCamera(secureContext: boolean, mediaDevices: MediaDevicesLike | undefined) {
  return secureContext && typeof mediaDevices?.getUserMedia === 'function'
}

/** Give a recovery path rather than exposing browser-specific error details. */
export function cameraErrorMessage(error: unknown) {
  const name = typeof error === 'object' && error !== null ? (error as CameraFailure).name : undefined
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Allow camera access in your browser, or choose a photo from your library instead.'
  }
  if (name === 'NotFoundError') return 'No camera was found. Choose a photo from your library instead.'
  return 'The camera could not start. Choose a photo from your library instead.'
}
