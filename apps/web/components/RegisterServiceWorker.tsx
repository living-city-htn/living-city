'use client'

import { useEffect } from 'react'

/** Registers public/sw.js, which is what turns the manifest into an install prompt. */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not fatal: without it the app still runs, it just is not installable.
    })
  }, [])
  return null
}
