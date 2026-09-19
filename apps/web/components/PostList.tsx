'use client'

/**
 * The post row, shared by the block panel and the Feed tab.
 *
 * Seed posts point at image paths that do not exist yet (real photos arrive
 * from Blob once Pipeline's upload lands), so a missing image collapses to
 * nothing rather than showing a broken tile.
 */
import { useRef, useState } from 'react'
import type { PostRow } from '@/lib/api'
import { toggleLike } from '@/lib/api'

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

function Post({ post, onLiked, community, onCommunity }: { post: PostRow; onLiked: (balance: number) => void; community?: string; onCommunity?: (id: string) => void }) {
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [broken, setBroken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const like = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    // Optimistic: a like must feel instant on a phone (PRD section 9).
    const next = !liked
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    try {
      const r = await toggleLike(post.id)
      setLiked(r.liked)
      setLikes(r.likes)
      onLiked(r.balance)
    } catch {
      setError('Your like wasn’t confirmed. Please try again.')
      setLiked(!next)
      setLikes((n) => n + (next ? -1 : 1))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // With a photo this reads like a photo feed: author, image, actions, caption.
  // Without one there is nothing to sit between the text and the actions, so
  // the caption comes first and the actions close the row.
  const initials = post.author_name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)
  const hasPhoto = Boolean(post.image_url) && !broken

  const actions = (
    <div className="post-actions">
      <button className="like" data-liked={liked} onClick={like} aria-pressed={liked} disabled={busy} aria-label={`${liked ? 'Unlike' : 'Like'} post by ${post.author_name}; ${likes} likes`}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        <span>{likes} {likes === 1 ? 'like' : 'likes'}</span>
      </button>
    </div>
  )

  return (
    <article className="post" data-photo={hasPhoto}>
      <div className="post-head">
        <span className="post-avatar" aria-hidden="true">{initials}</span>
        <span className="post-author">{post.author_name}</span>
        <span className="post-time">{when(post.created_at)}</span>
      </div>
      {community && onCommunity && <button className="post-community" onClick={() => onCommunity(post.community_id)}>{community}<span aria-hidden="true"> ↗</span></button>}
      {post.image_url && !broken && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="post-photo" src={post.image_url} alt="" onError={() => setBroken(true)} />
      )}
      {hasPhoto ? (
        <>
          {actions}
          <p className="post-text">{post.text}</p>
        </>
      ) : (
        <>
          <p className="post-text">{post.text}</p>
          {actions}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  )
}

export default function PostList({
  posts,
  onLiked,
  empty = 'Nothing here yet.',
  communities,
  onCommunity,
}: {
  posts: PostRow[]
  onLiked: (balance: number) => void
  empty?: string
  communities?: Record<string, string>
  onCommunity?: (id: string) => void
}) {
  if (posts.length === 0) return <p className="muted">{empty}</p>
  return (
    <div className="posts">
      {posts.map((p) => (
        <Post key={p.id} post={p} onLiked={onLiked} community={communities?.[p.community_id]} onCommunity={onCommunity} />
      ))}
    </div>
  )
}
