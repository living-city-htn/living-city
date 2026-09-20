export type LocationErrorLike = { code?: number }

export const locationOptions = (fallback: boolean): PositionOptions => fallback
  ? { timeout: 20_000, maximumAge: 5 * 60_000, enableHighAccuracy: false }
  : { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: true }

export function locationErrorMessage(error: LocationErrorLike): string {
  switch (error.code) {
    case 1: return 'Allow location for Living City in your browser settings, then try again.'
    case 2: return 'Your phone could not find a location. Move somewhere with a clearer signal and try again.'
    case 3: return 'Location is taking too long. Try again, or choose a community below.'
    default: return 'Location could not be found. Choose a community or tap the map.'
  }
}
