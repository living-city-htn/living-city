/**
 * Device-bound identity for the Stage 1 fixture/API boundary.
 *
 * Middleware creates the opaque device cookie and forwards its value in a
 * request header. Route handlers use that header to resolve a stable user.
 * The government account is bound to one explicitly configured device value;
 * a resident cannot select their role from request data.
 */

export const DEVICE_COOKIE = 'living-city-device'
export const DEVICE_HEADER = 'x-living-city-device'
export const isDeviceId = (value: string): boolean => /^[A-Za-z0-9._~-]{16,128}$/.test(value)

export type AppUser = {
  id: string
  display_name: string
  role: 'resident' | 'government'
}

let governmentDeviceId = process.env.GOVERNMENT_DEVICE_ID?.trim() ?? ''
const users = new Map<string, AppUser>()

const resident = (deviceId: string): AppUser => ({
  id: `device:${deviceId}`,
  display_name: `Resident ${deviceId.slice(0, 6)}`,
  role: 'resident',
})

export const deviceIdFromRequest = (request: Request): string | null => {
  const forwarded = request.headers.get(DEVICE_HEADER)?.trim() ?? ''
  if (isDeviceId(forwarded)) return forwarded

  const cookieHeader = request.headers.get('cookie') ?? ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_COOKIE}=`))
  if (!match) return null
  try {
    const value = decodeURIComponent(match.slice(DEVICE_COOKIE.length + 1))
    return isDeviceId(value) ? value : null
  } catch {
    return null
  }
}

export const userForDevice = (deviceId: string): AppUser => {
  const existing = users.get(deviceId)
  if (existing) return existing

  const user = governmentDeviceId !== '' && deviceId === governmentDeviceId
    ? { id: 'u-gov', display_name: 'City of Kitchener (Staff)', role: 'government' as const }
    : resident(deviceId)
  users.set(deviceId, user)
  return user
}

/**
 * The optional argument keeps pure route tests ergonomic. Production handlers
 * always pass their Request, which is populated by middleware.
 */
export const currentUser = (request?: Request): AppUser => {
  const deviceId = request ? deviceIdFromRequest(request) : null
  return userForDevice(deviceId ?? 'fixture-resident')
}

export const isGovernment = (user: AppUser): boolean => user.role === 'government'

/** Test-only reset; no production code calls this. */
export const resetIdentityForTests = (configuredGovernmentDeviceId = ''): void => {
  users.clear()
  governmentDeviceId = configuredGovernmentDeviceId
}
