'use client'

/**
 * Accounts are device-bound; the person picks the name their posts and
 * comments carry (docs/01 section 13, the default answer). Shown once, on the
 * Feed, until a name is saved. Skipping it is fine: posts then read "Resident".
 */
import { useId, useState, type FormEvent } from 'react'
import { setDisplayName } from '@/lib/api'

export default function NameCard({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)
  const fieldId = useId()
  if (hidden) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || name.trim().length < 2) return
    setBusy(true)
    setError('')
    try {
      await setDisplayName(name)
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your name.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="name-card" aria-label="Choose your display name">
      <p><strong>How should your posts be signed?</strong> Pick a name other residents will see.</p>
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor={fieldId} className="sr-only">Display name</label>
        <input id={fieldId} value={name} maxLength={32} placeholder="Your name" autoComplete="nickname"
          onChange={(e) => setName(e.target.value)} disabled={busy} />
        <button className="form-button" type="submit" disabled={busy || name.trim().length < 2}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="form-button" type="button" onClick={() => setHidden(true)}>Not now</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}
