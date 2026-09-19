'use client'

/**
 * Demo moment 3, and the one action moment 8 depends on a stranger performing
 * without instruction. So it opens the way a phone camera app opens: the
 * capture is the screen, not a field on a form.
 *
 * Three states rather than one long form:
 *   choose  - full screen, camera first, with a way out to text only
 *   compose - the photo, then a caption, then where it happened
 *   picking - collapsed to a bar so the map underneath is tappable
 *
 * Everything the previous form did is kept: the resize pipeline, geolocation to
 * the nearest community, the manual picker, text-only posts, the draft
 * surviving a tab switch and a failed request, the caption-without-photo
 * fallback, and never resending a request whose outcome is unknown.
 */
import { useRef, useState } from 'react'
import type { CityPayload } from './city'
import { preparePhoto } from '@/lib/post-photo'
import { nearestCommunity } from '@/lib/post-location'

export type PostLocation = { community_id?: string; lon?: number; lat?: number; label: string }
export type PostResult = {
  post: { id: string; community_id: string; status: 'pending' | 'analyzed'; hidden: boolean }
  balance?: number
  points_earned?: number
}

export default function PostComposer({
  city, location, onLocation, picking, onPick, onPosted, onDismiss, active,
}: {
  city: CityPayload
  location: PostLocation | null
  onLocation: (location: PostLocation) => void
  picking: boolean
  onPick: (picking: boolean) => void
  onPosted: (result: PostResult) => void
  onDismiss: () => void
  active: boolean
}) {
  const [step, setStep] = useState<'choose' | 'compose'>('choose')
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [photoUnavailable, setPhotoUnavailable] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const submitting = useRef(false)
  const locationRequest = useRef(0)

  const choosePhoto = async (file?: File) => {
    if (!file) return
    setPreparing(true)
    setError('')
    setPhotoUnavailable(false)
    try {
      setPhoto(await preparePhoto(file))
      setStep('compose')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this photo.')
    } finally {
      setPreparing(false)
    }
  }

  const locate = () => {
    if (!navigator.geolocation) {
      setError('Location is unavailable. Choose a community below.')
      return
    }
    const request = ++locationRequest.current
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return
        setLocating(false)
        const { longitude: lon, latitude: lat } = position.coords
        const community = nearestCommunity(city.communities, lon, lat)
        if (!community) {
          setError('Could not match your location. Choose a community or tap the map.')
          return
        }
        onLocation({
          community_id: community.community_id, lon, lat,
          label: `${community.name} · Nearest community to your location`,
        })
      },
      () => {
        if (request !== locationRequest.current) return
        setLocating(false)
        setError('Location could not be found. Choose a community or tap the map.')
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true },
    )
  }

  const submit = async (withoutPhoto = false) => {
    if (submitting.current || locating || preparing || !location) return
    if (!text.trim() && !(photo && !withoutPhoto)) return
    submitting.current = true
    setBusy(true)
    setError('')
    setUncertain(false)
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(), image_url: withoutPhoto ? null : photo,
          community_id: location.community_id, lon: location.lon, lat: location.lat,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setPhotoUnavailable(data.code === 'PHOTO_UNAVAILABLE')
        setError(data.error ?? 'Your post was not accepted. Your draft is still here.')
        return
      }
      if (!data.post?.id || !data.post?.community_id) throw new Error('Unexpected response')
      setText('')
      setPhoto(null)
      setPhotoUnavailable(false)
      setStep('choose')
      onPosted(data as PostResult)
    } catch {
      // A failed response does not prove the post did not land.
      setUncertain(true)
      setError(
        'We could not confirm whether your post arrived. Check the Feed before trying again ' +
        'to avoid posting twice. Your draft is saved here.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const canPost = Boolean(location) && (text.trim().length > 0 || Boolean(photo)) && !locating
  // Shown when this is the current tab and the map is not being used to pick.
  const composing = active && !picking

  /*
   * The composer stays mounted rather than returning nothing when it is not
   * the current tab. Its own state survived either way — React keeps the
   * component, only the markup went — but rebuilding the markup re-fired the
   * textarea's autoFocus, so coming back to a half-written post reopened the
   * keyboard and threw away where you were. Staying mounted also lets it fade
   * like every other destination.
   */
  return (
    <>
      {/* Collapsed to a bar so the whole map is reachable underneath. */}
      {active && picking && (
        <section className="pick-bar" aria-label="Choose a block">
          <p>Tap a block on the map</p>
          <button className="form-button" onClick={() => onPick(false)}>Cancel</button>
        </section>
      )}
      <section
        className="composer page-screen"
        aria-label="Create a post"
        data-shown={composing}
        inert={!composing}
      >
        <div className="composer-topbar"><span /><button type="button" className="form-button" onClick={onDismiss}>Close</button></div>

        {step === 'choose' ? (
          <div className="composer-body capture">
            <div className="capture-lead">
              <h2>Create a post</h2>
              <p>The places, people, and little things that make your neighbourhood yours.</p>
            </div>

            <label className="capture-primary">
              {preparing ? 'Preparing photo…' : 'Take a photo'}
              <input
                disabled={preparing || busy} aria-label="Take a photo" type="file" accept="image/*" capture="environment"
                onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = '' }}
              />
            </label>

            <label className="capture-secondary">
              Choose from library
              <input
                disabled={preparing || busy} aria-label="Choose from library" type="file" accept="image/*"
                onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = '' }}
              />
            </label>

            <button className="capture-text" disabled={preparing || busy} onClick={() => setStep('compose')}>
              Write without a photo
            </button>

            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        ) : (
          <form
            className="composer-body"
            onSubmit={(e) => { e.preventDefault(); void submit() }}
          >
            <header className="composer-head">
              <button
                type="button" className="composer-back" aria-label="Back to photo choices" disabled={busy || preparing}
                onClick={() => { setStep('choose'); setError('') }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <h2>{photo ? 'Add a caption' : 'What’s happening?'}</h2>
              <button className="composer-post" type="submit" disabled={!canPost || busy || preparing}>
                {busy ? 'Posting…' : uncertain ? 'Try again' : 'Post'}
              </button>
            </header>

            <fieldset disabled={busy || preparing}>
              <legend className="sr-only">Your post</legend>

              {photo && (
                <div className="composer-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Photo ready to post" />
                  <button
                    type="button" className="form-button"
                    onClick={() => { setPhoto(null); setPhotoUnavailable(false) }}
                  >
                    Remove photo
                  </button>
                </div>
              )}

              <label className="sr-only" htmlFor="post-caption">
                {photo ? 'Caption' : 'What’s happening?'}
              </label>
              <textarea
                id="post-caption" rows={photo ? 3 : 6} maxLength={1000} value={text}
                onChange={(e) => setText(e.target.value)} autoFocus={!photo}
                placeholder={photo ? 'Say something about it…' : 'Live music, warm lights, good company…'}
              />
              <p className="character-count">{text.length}/1,000 · Text-only posts welcome</p>

              <div className="composer-where">
                <label className="field-label" htmlFor="post-community">Where did it happen?</label>
                <select
                  id="post-community" value={location?.community_id ?? ''}
                  onChange={(e) => {
                    const c = city.communities.find((c) => c.community_id === e.target.value)
                    if (!c) return
                    locationRequest.current++
                    setLocating(false)
                    onLocation({
                      community_id: c.community_id, lon: c.centroid[0], lat: c.centroid[1], label: c.name,
                    })
                  }}
                >
                  <option value="" disabled>Choose a community</option>
                  {city.communities.map((c) => (
                    <option value={c.community_id} key={c.community_id}>{c.name}</option>
                  ))}
                </select>
                <div className="photo-actions">
                  <button type="button" className="form-button" disabled={locating} onClick={locate}>
                    {locating ? 'Finding location…' : 'Use my location'}
                  </button>
                  <button
                    type="button" className="form-button"
                    onClick={() => { locationRequest.current++; setLocating(false); onPick(true) }}
                  >
                    Choose on map
                  </button>
                </div>
                {location && <p className="muted" role="status">{location.label}</p>}
              </div>
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}
            {photoUnavailable && photo && (
              <button
                type="button" className="form-button"
                disabled={busy || locating || preparing || !text.trim()}
                onClick={() => void submit(true)}
              >
                Post caption without photo
              </button>
            )}
          </form>
        )}
      </section>
    </>
  )
}
