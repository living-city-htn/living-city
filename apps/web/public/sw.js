/*
 * The minimal service worker from the Stage 1 checklist, and deliberately no
 * more: it exists so the app is installable, and it caches nothing.
 *
 * A caching service worker is a foot-gun on stage. Every screen in the script
 * is live data (the feed, the block panel, the plan the judge just changed),
 * and a stale shell served from cache during moment 4 or 8 would look exactly
 * like a broken demo with no way to diagnose it in ten seconds. Network-only
 * keeps the install prompt and keeps the demo honest.
 *
 * If offline support is ever wanted, it is Stage 4 polish at the earliest and
 * it needs a rehearsal afterwards (docs/05 section 7, Gate 3).
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // No respondWith: the browser does exactly what it would without us.
})
