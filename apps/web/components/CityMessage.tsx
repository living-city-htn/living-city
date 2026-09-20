'use client'

/**
 * The line over the city while a post is on its way into it.
 *
 * Moment 4 has a gap in it: the post is saved, the block has not changed yet,
 * and for up to half a minute the city looks exactly as it did. The block's
 * blue planning outline says something is coming, but only to whoever already
 * knows what a blue outline means. This says it in words, above the city, for
 * the room.
 *
 * It fades rather than disappears, because the thing it is announcing arrives
 * at the same instant: the plan lands, the block rebuilds, and this gets out of
 * the way of the thing everyone is meant to be looking at.
 */
import { useEffect, useRef, useState } from 'react'
import './city-message.css'

/** Matches the fade in city-message.css. Long enough to read as a fade. */
const FADE_MS = 520

export default function CityMessage({ active }: { active: boolean }) {
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(timer.current)
    if (active) {
      setShown(true)
      setLeaving(false)
      return
    }
    // Start the fade and unmount at the end of it. Nothing to fade if it was
    // never up, which is the common case on first render.
    setLeaving(true)
    timer.current = setTimeout(() => {
      setShown(false)
      setLeaving(false)
    }, FADE_MS)
    return () => clearTimeout(timer.current)
  }, [active])

  if (!shown) return null

  return (
    <p className="city-message" data-leaving={leaving} role="status">
      <span className="city-message-dot" aria-hidden="true" />
      City got a new message
    </p>
  )
}
