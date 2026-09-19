import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import RegisterServiceWorker from '@/components/RegisterServiceWorker'

export const metadata: Metadata = {
  title: 'Living City',
  description: 'A city that rebuilds itself from what people post.',
  // iOS ignores the manifest's display mode; this is what makes an installed
  // icon open without Safari's chrome.
  appleWebApp: { capable: true, title: 'Living City', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
  // Next emits the modern `mobile-web-app-capable`. iOS before 15.4 only knows
  // the prefixed one, and the demo phone is not worth guessing about.
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  // The city is full-bleed, so the page owns the notch area and the strip pads
  // itself back out with env(safe-area-inset-*).
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  // No pinch-zoom on the page: pinch belongs to the city (PRD 8.12), and a
  // double-tap that zooms the document would fight every block tap.
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0f' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
