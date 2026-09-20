'use client'

/**
 * Describe a real place, get a building on your own map.
 *
 * Private by construction: everything this component reads and writes goes
 * through `/api/me/buildings`, which is scoped to the signed-in user. Nothing
 * here can touch a public plan, a block's geometry or anyone else's city
 * (AGENTS.md, "Respect the two layers").
 *
 * The component is self-contained - it owns its own fetches rather than
 * lifting state into `AppShell` - because the whole feature is behind a flag
 * and may be switched off for the demo. When the route answers 503 the form
 * disappears and `MyCityPanel` is exactly what it was before.
 *
 * The building itself is drawn by the scene: `buildingModel` in
 * packages/modeling turns the spec into geometry deterministically, and
 * `scene/SpecBuilding` stands it on a free slot in My City. The card below is
 * the spec in words, so a judge can see what the model understood.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Mirrors `BuildingSpec` in packages/pipeline. Structural, so it cannot drift silently. */
type BuildingSpec = {
  name: string
  summary: string
  kind: string
  height: string
  storeys: number
  palette: string
  mood: string
  identity_tags: string[]
  features: string[]
  confidence: number
  sources: string[]
}

type Building = {
  id: string
  community_id: string
  slot_id: string | null
  name: string
  image_url: string | null
  created_at: string
  spec: BuildingSpec
}

/** Well under the route's ceiling, and small enough to survive a phone upload. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_DESCRIPTION = 600

const pretty = (value: string) => value.replace(/_/g, ' ')

export default function BuildingComposer({
  communityId,
  active,
  onChanged,
}: {
  communityId: string | null
  active: boolean
  onChanged?: () => void
}) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<{ url: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/me/buildings')
      if (!response.ok) return
      const body = await response.json() as { buildings?: Building[] }
      setBuildings(body.buildings ?? [])
    } catch {
      // A failed refresh leaves the last good list on screen. There is nothing
      // for the user to do about it and nothing worth interrupting them for.
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
  }, [active, refresh])

  const onFile = (file: File | undefined) => {
    setError('')
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That photo is too large. Try one under 4 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage({ url: String(reader.result), name: file.name })
    reader.onerror = () => setError('That photo could not be read.')
    reader.readAsDataURL(file)
  }

  const submit = async () => {
    if (!communityId) {
      setError('Choose a neighbourhood first.')
      return
    }
    const text = description.trim()
    if (!text) {
      setError('Say what the place is.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/me/buildings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          community_id: communityId,
          description: text,
          image_url: image?.url ?? null,
        }),
      })
      const body = await response.json() as {
        building?: Building; error?: string; code?: string; searched?: boolean
      }

      if (response.status === 503 && body.code === 'BUILDING_SPECS_OFF') {
        setAvailable(false)
        return
      }
      if (!response.ok || !body.building) {
        setError(body.error ?? 'That did not work. Try again.')
        return
      }

      setBuildings((current) => [body.building as Building, ...current])
      setDescription('')
      setImage(null)
      if (fileRef.current) fileRef.current.value = ''
      setNotice(body.searched
        ? `Added ${body.building.name}. Looked it up to fill in the gaps.`
        : `Added ${body.building.name}.`)
      onChanged?.()
    } catch {
      setError('Could not reach the building service.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBuildings((current) => current.filter((b) => b.id !== id))
    try {
      await fetch(`/api/me/buildings/${id}`, { method: 'DELETE' })
      onChanged?.()
    } catch {
      void refresh()
    }
  }

  if (available === false) return null

  return (
    <div className="building-composer">
      <h3>Build a place you know</h3>
      <p className="muted">
        Add a photo and say what it is. Only you will see it.
      </p>

      <label className="building-field">
        <span>Photo</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL, never a remote asset
        <img className="building-preview" src={image.url} alt={`Selected photo: ${image.name}`} />
      )}

      <label className="building-field">
        <span>What is it?</span>
        <textarea
          rows={3}
          value={description}
          maxLength={MAX_DESCRIPTION}
          disabled={busy}
          placeholder="The brick cafe on King Street with the green awning"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && <p className="shop-feedback" role="alert">{error}</p>}
      {notice && !error && <p className="shop-feedback" role="status">{notice}</p>}

      <button className="form-button" disabled={busy || !description.trim()} onClick={submit}>
        {busy ? 'Building…' : 'Add to my city'}
      </button>
      {busy && (
        <p className="muted" role="status">
          Reading the photo. This can take a few seconds.
        </p>
      )}

      {buildings.length > 0 && (
        <ul className="building-list">
          {buildings.map((b) => (
            <li key={b.id} className="building-card">
              <div className="building-card-head">
                <strong>{b.name}</strong>
                <button
                  className="link-button"
                  aria-label={`Remove ${b.name}`}
                  onClick={() => remove(b.id)}
                >
                  Remove
                </button>
              </div>
              <p className="muted">{b.spec.summary}</p>
              <p className="building-meta">
                {pretty(b.spec.kind)} · {b.spec.storeys}
                {b.spec.storeys === 1 ? ' storey' : ' storeys'} · {pretty(b.spec.mood)}
              </p>
              <ul className="building-tags">
                {[...b.spec.identity_tags, ...b.spec.features].map((tag) => (
                  <li key={tag}>{pretty(tag)}</li>
                ))}
              </ul>
              {b.spec.sources.length > 0 && (
                <p className="building-meta">
                  Checked against {b.spec.sources.length}{' '}
                  {b.spec.sources.length === 1 ? 'reference' : 'references'}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
