'use client'

import { useState } from 'react'
import { ASSET_ALIASES } from '@living-city/modeling'

/**
 * Static renders of the actual placed models. The original symbols remain
 * available when a preview cannot be loaded.
 */
export default function ItemDrawing({ tag, size = 48 }: { tag: string; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const assetId = ASSET_ALIASES[tag]
  const previewUrl = assetId ? `/assets/previews/${assetId}.png` : null
  const shapes: Record<string, React.ReactNode> = {
    benches: <><path d="M10 17h28v10H10zM7 30h34M12 30v10M36 30v10M15 17v10M33 17v10" /></>,
    planters: <><path d="m14 28 3 13h14l3-13zM12 28h24M24 28V16M24 22c-9 0-11-5-11-9 7 0 11 3 11 9ZM24 18c0-7 5-10 11-10 0 6-4 10-11 10Z" /></>,
    string_lights: <><path d="M5 12c9 12 29 12 38 0M12 18v6M24 22v6M36 18v6" /><circle cx="12" cy="27" r="3" /><circle cx="24" cy="31" r="3" /><circle cx="36" cy="27" r="3" /></>,
    food_trucks: <><path d="M7 13h24v23H7zM31 21h7l5 8v7H31M12 18h14v9H12zM36 24v6h7" /><circle cx="15" cy="37" r="4" /><circle cx="35" cy="37" r="4" /></>,
    fountain: <><path d="M8 34c0 9 32 9 32 0ZM24 34V15M14 24c0-12 10-12 10-3 0-9 10-9 10 3M24 14v-4" /></>,
    sculpture: <><path d="M12 40h24v-5H12zM18 35l-4-16 17-9 4 16-17 9ZM14 19l21 7M31 10l-8 20" /></>,
  }
  if (previewUrl && failedUrl !== previewUrl) return <img src={previewUrl} alt="" aria-hidden="true" width={size} height={size} style={{ objectFit: 'contain' }} onError={() => setFailedUrl(previewUrl)} />
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[tag] ?? <path d="m24 8 16 16-16 16L8 24Z" />}
    </svg>
  )
}
