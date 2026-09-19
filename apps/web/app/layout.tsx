import type { ReactNode } from 'react'

export const metadata = {
  title: 'Living City',
  description: 'A city that rebuilds itself from what people post.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  )
}
