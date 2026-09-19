'use client'

/**
 * Demo moment 8: "QR code. Post something yourself." (docs/04 section 2).
 *
 * Shown on the laptop or the projector, not on a phone. Judges scan it, land on
 * the app, and post. The code points at this deployment's own origin, so the
 * preview and production builds each advertise themselves and nothing is
 * hardcoded.
 *
 * The operator can pause it from /operator. That is volume throttling, not a
 * safety fuse — the fuse for bad content is hide-post.
 */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const POLL_MS = 5_000

export default function QrPage() {
  const [svg, setSvg] = useState('')
  const [url, setUrl] = useState('')
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const origin = window.location.origin
    setUrl(origin)
    QRCode.toString(origin, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#1c1c1e', light: '#0000' },
    })
      .then(setSvg)
      .catch(() => {})
  }, [])

  // The operator pauses from their own page, so this one has to watch for it.
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const body = await fetch('/api/operator/qr', { cache: 'no-store' }).then((r) => r.json())
        if (!cancelled && typeof body?.paused === 'boolean') setPaused(body.paused)
      } catch {
        // Leave the last known state on screen rather than flapping.
      }
    }
    void read()
    const id = setInterval(() => void read(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <main className="qr">
      {paused ? (
        <div className="qr-paused">
          <h1>Back in a moment</h1>
          <p>The city is catching up on the last few posts.</p>
        </div>
      ) : (
        <>
          <h1>Post something yourself</h1>
          <p className="qr-lede">Scan this, take a photo of where you are, and watch your block change.</p>
          <div
            className="qr-code"
            aria-label={`QR code linking to ${url}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="qr-url">{url}</p>
        </>
      )}
    </main>
  )
}
