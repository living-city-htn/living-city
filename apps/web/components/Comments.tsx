'use client'

/**
 * One post's comments. One level, text only (docs/01 section 8.3). Loaded when
 * opened rather than with the feed, so a feed of fifty posts is still one
 * request. Commenting pays 3 points, and 4 to the author (section 8.8).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { addComment, getComments, type CommentRow } from '@/lib/api'

const MAX = 500

export default function Comments({ postId, count, onCount, onBalance }: {
  postId: string
  count: number
  onCount: (n: number) => void
  onBalance: (balance: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CommentRow[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [earned, setEarned] = useState(0)
  const inFlight = useRef(false)
  const fieldId = useId()

  useEffect(() => {
    if (!open || rows !== null) return
    let live = true
    getComments(postId)
      .then((r) => { if (live) { setRows(r); onCount(r.length) } })
      .catch(() => { if (live) setError('Comments could not be loaded.') })
    return () => { live = false }
  }, [open, rows, postId, onCount])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await addComment(postId, text)
      setRows((r) => [...(r ?? []), result.comment])
      setDraft('')
      setEarned(result.points_earned)
      onCount(result.count)
      onBalance(result.balance)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your comment wasn’t posted.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="comments">
      <button className="comments-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path d="M4 5.5h16v10H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <span>{count} {count === 1 ? 'comment' : 'comments'}</span>
      </button>
      {open && (
        <div className="comments-body">
          {rows === null && !error && <p className="muted" role="status">Loading comments…</p>}
          {rows && rows.length === 0 && <p className="muted">No comments yet. Say something nice.</p>}
          {rows && rows.length > 0 && (
            <ul className="comment-list">
              {rows.map((c) => (
                <li key={c.id} className="comment" data-mine={c.mine}>
                  <strong>{c.mine ? 'You' : c.author_name}</strong> <span>{c.text}</span>
                </li>
              ))}
            </ul>
          )}
          <form className="comment-form" onSubmit={(e) => void submit(e)}>
            <label htmlFor={fieldId} className="sr-only">Add a comment</label>
            <input
              id={fieldId}
              value={draft}
              maxLength={MAX}
              placeholder="Add a comment"
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              autoComplete="off"
              enterKeyHint="send"
            />
            <button className="form-button" type="submit" disabled={busy || draft.trim() === ''}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </form>
          {earned > 0 && <p className="comment-earned" role="status">+{earned} points</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
