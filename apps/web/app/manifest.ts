import type { MetadataRoute } from 'next'

/**
 * Served at /manifest.webmanifest. This is what makes moment 3 possible:
 * "PWA on the home screen" (docs/04 section 2).
 *
 * `display: standalone` is the point — installed, the app has no browser
 * chrome, so a judge holding the phone sees the city and the tab bar and
 * nothing else. Colours are the near-white and near-black from
 * apps/web/DESIGN.md.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Living City',
    short_name: 'Living City',
    description: 'A city that rebuilds itself from what people post.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbfbfd',
    theme_color: '#fbfbfd',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
