'use client'

/**
 * Demo moment 2: "Tap two contrasting blocks. Read their summaries. Open the
 * why panel on one." (docs/04 section 2).
 *
 * A bottom sheet over the map, not a full-screen push, so the city stays
 * visible while you read about it (apps/web/DESIGN.md, "Panels").
 *
 * Summary, mood and tags are the plan's own words; "Why it looks like this" is
 * the plan's `stability.reasons`, which the validator requires to be
 * evidence-based (docs/03 section 3.2). Nothing on this panel is written by a
 * model at read time.
 */
import { useEffect, useRef, useState } from 'react'
import type { BlockState, PostRow } from '@/lib/api'
import { getBlockPosts, getBlockState } from '@/lib/api'
import PostList from './PostList'

export default function BlockPanel({
  communityId,
  name,
  planId,
  onClose,
  onLiked,
  onHeight,
}: {
  communityId: string
  name: string
  /**
   * The block's current plan id. When it changes the block has been replanned,
   * so the panel re-reads itself — otherwise moment 4 leaves a panel open that
   * still describes the plan the city just replaced.
   */
  planId: string | undefined
  onClose: () => void
  onLiked: (balance: number) => void
  /** Reports the sheet's height so the map can keep the block above it. */
  onHeight: (px: number) => void
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onHeight(entry.contentRect.height)
    })
    observer.observe(node)
    onHeight(node.getBoundingClientRect().height)
    return () => {
      observer.disconnect()
      onHeight(0)
    }
  }, [onHeight])

  const [state, setState] = useState<BlockState | null>(null)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [why, setWhy] = useState(false)

  useEffect(() => {
    let live = true
    setState(null)
    setPosts([])
    setWhy(false)
    Promise.all([getBlockState(communityId), getBlockPosts(communityId)])
      .then(([s, p]) => {
        if (!live) return
        setState(s)
        setPosts(p)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [communityId, planId])

  return (
    <section ref={ref} className="sheet block-sheet" aria-label={`${name} details`}>
      <header className="sheet-head">
        <div>
          <h2>{name}</h2>
          {state && (
            <p className="sheet-sub">
              <span className="mood">{state.mood.replace(/_/g, ' ')}</span> · {state.post_count}{' '}
              {state.post_count === 1 ? 'post' : 'posts'}
            </p>
          )}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="sheet-body">
        {!state ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="summary">{state.summary}</p>

            {state.top_tags.length > 0 && (
              <ul className="tags">
                {state.top_tags.map((t) => (
                  <li key={t}>{t.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            )}

            <button className="why" onClick={() => setWhy((v) => !v)} aria-expanded={why}>
              Why does it look like this?
              <span className="chev" data-open={why} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {why && (
              <ul className="reasons">
                {state.reasons.length > 0 ? (
                  state.reasons.map((r) => <li key={r}>{r}</li>)
                ) : (
                  <li className="muted">No reasons recorded for this plan.</li>
                )}
              </ul>
            )}

            <h3 className="section-label">Recent posts</h3>
            <PostList posts={posts} onLiked={onLiked} empty="No posts from this block yet." />
          </>
        )}
      </div>
    </section>
  )
}
