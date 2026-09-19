'use client'

import { useRef, useState } from 'react'
import type { CityPayload } from './city'
import { preparePhoto } from '@/lib/post-photo'
import { nearestCommunity } from '@/lib/post-location'

export type PostLocation = { community_id?: string; lon?: number; lat?: number; label: string }
export type PostResult = {
  post: { id: string; community_id: string; status: 'pending' | 'analyzed'; hidden: boolean }
  balance?: number; points_earned?: number
}
export default function PostComposer({ city, location, onLocation, picking, onPick, onPosted, active }: {
  city: CityPayload; location: PostLocation | null; onLocation: (location: PostLocation) => void
  picking: boolean; onPick: (picking: boolean) => void; onPosted: (result: PostResult) => void; active: boolean
}) {
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
    setPreparing(true); setError(''); setPhotoUnavailable(false)
    try { setPhoto(await preparePhoto(file)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open this photo.') }
    finally { setPreparing(false) }
  }
  const locate = () => {
    if (!navigator.geolocation) { setError('Location is unavailable. Choose a community below.'); return }
    const request = ++locationRequest.current
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return
      setLocating(false)
      const { longitude: lon, latitude: lat } = position.coords
      const community = nearestCommunity(city.communities, lon, lat)
      if (!community) {
        setError('Could not match your location. Choose a community or tap the map.')
        return
      }
      onLocation({ community_id: community.community_id, lon, lat,
        label: `${community.name} · Nearest community to your location` })
    }, () => {
      if (request !== locationRequest.current) return
      setLocating(false); setError('Location could not be found. Choose a community or tap the map.')
    }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true })
  }
  const submit = async (withoutPhoto = false) => {
    if (submitting.current || locating || preparing || !location || (!text.trim() && !(photo && !withoutPhoto))) return
    submitting.current = true; setBusy(true); setError(''); setUncertain(false)
    try {
      const response = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), image_url: withoutPhoto ? null : photo,
          community_id: location.community_id, lon: location.lon, lat: location.lat }) })
      const data = await response.json()
      if (!response.ok) {
        setPhotoUnavailable(data.code === 'PHOTO_UNAVAILABLE')
        setError(data.error ?? 'Your post was not accepted. Your draft is still here.')
        return
      }
      if (!data.post?.id || !data.post?.community_id) throw new Error('Unexpected response')
      setText(''); setPhoto(null); setPhotoUnavailable(false)
      onPosted(data as PostResult)
    } catch {
      setUncertain(true)
      setError('We could not confirm whether your post arrived. Check the Feed before trying again to avoid posting twice. Your draft is saved here.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return (
    <section className="sheet composer" aria-label="Create a post" style={!active ? { display: 'none' } : undefined}>
      <header className="sheet-head"><div><h2>{picking ? 'Choose a block' : 'Share a moment'}</h2>
        <p className="sheet-sub">{picking ? 'Tap a community on the map above.' : 'A little of your day. A little more life in the city.'}</p></div>
        {picking && <button className="form-button" onClick={() => onPick(false)}>Back</button>}
      </header>
      {!picking && <form className="sheet-body post-form" onSubmit={e => { e.preventDefault(); void submit() }}>
        <fieldset disabled={busy || preparing}><legend className="sr-only">Your post</legend>
          {photo && <div className="photo-preview"><img src={photo} alt="Photo ready to post" /><button type="button" className="form-button" onClick={() => { setPhoto(null); setPhotoUnavailable(false) }}>Remove photo</button></div>}
          <div className="photo-actions">
            <label className="form-button file-button">Take photo<input aria-label="Take photo" type="file" accept="image/*" capture="environment" onChange={e => { void choosePhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
            <label className="form-button file-button">Choose photo<input aria-label="Choose photo" type="file" accept="image/*" onChange={e => { void choosePhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
          </div>
          <label className="field-label" htmlFor="post-caption">{photo ? 'Caption (optional)' : 'What’s happening?'}</label>
          <textarea id="post-caption" rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="Live music, warm lights, good company…" />
          <p className="character-count">{text.length}/1,000 · Text-only posts welcome</p>
          <label className="field-label" htmlFor="post-community">Where did it happen?</label>
          <select id="post-community" value={location?.community_id ?? ''} onChange={e => {
            const c = city.communities.find(c => c.community_id === e.target.value)
            if (!c) return
            locationRequest.current++; setLocating(false)
            onLocation({ community_id: c.community_id, lon: c.centroid[0], lat: c.centroid[1], label: c.name })
          }}><option value="" disabled>Choose a community</option>
            {city.communities.map(c => <option value={c.community_id} key={c.community_id}>{c.name}</option>)}
          </select>
          <div className="photo-actions"><button type="button" className="form-button" disabled={locating} onClick={locate}>{locating ? 'Finding location…' : 'Use my location'}</button>
            <button type="button" className="form-button" onClick={() => { locationRequest.current++; setLocating(false); onPick(true) }}>Choose on map</button></div>
          {location && <p className="muted" role="status">{location.label}</p>}
          <button className="submit-post" type="submit" disabled={!location || (!text.trim() && !photo) || locating}>{busy ? 'Posting…' : preparing ? 'Preparing photo…' : uncertain ? 'Try posting again' : 'Post to city'}</button>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {photoUnavailable && photo && <button type="button" disabled={busy || locating || preparing || !text.trim()} className="form-button" onClick={() => void submit(true)}>Post caption without photo</button>}
      </form>}
    </section>
  )
}
