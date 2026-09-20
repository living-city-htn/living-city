import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DEVICE_COOKIE, DEVICE_HEADER, isDeviceId } from './lib/identity'

/**
 * Establish one opaque device identity before API routes run. The forwarded
 * header lets a route use the freshly generated value on the first request.
 * Next 15 documents this request-header forwarding pattern for middleware.
 * Source: https://nextjs.org/docs/15/pages/api-reference/file-conventions/middleware
 */
export function middleware(request: NextRequest) {
  const stored = request.cookies.get(DEVICE_COOKIE)?.value ?? ''
  const deviceId = isDeviceId(stored) ? stored : crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(DEVICE_HEADER, deviceId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (deviceId !== stored) {
    response.cookies.set({
      name: DEVICE_COOKIE,
      value: deviceId,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return response
}

export const config = {
  matcher: ['/api/:path*', '/government/:path*'],
}
