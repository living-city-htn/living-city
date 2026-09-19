'use client'

/**
 * Demo moment 2: "Tap two contrasting blocks. Read their summaries. Open the
 * why panel on one." (docs/04 section 2).
 *
 * A compact mobile preview expands into details; desktop uses a right-side
 * inspector beside the scene.
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
import './city-controls.css'

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

  const [state, setState] = useState<BlockState | null>(null)
  const [posts, setPosts] = useState<PostRow[]>([])
  const [why, setWhy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => setExpanded(false), [communityId])

  const expandedRef = useRef(false)
  expandedRef.current = expanded

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const report = () => {
      /*
       * Expanding this card lays it over the map; it does not push the map up.
       * Reporting the expanded height drove the viewport's height to nearly
       * zero and the city disappeared behind the card describing it.
       */
      if (expandedRef.current) return
      // Rounded because the shell rounds it again for CSS, so sub-pixel
      // jitter was re-rendering the tree to produce identical styles.
      onHeight(Math.round(node.getBoundingClientRect().height))
    }
    const observer = new ResizeObserver(report)
    observer.observe(node)
    report()
    return () => {
      observer.disconnect()
      onHeight(0)
    }
  }, [onHeight])

  useEffect(() => {
    let live = true
    setState(null)
    setError('')
    setPosts([])
    setWhy(false)
    Promise.all([getBlockState(communityId), getBlockPosts(communityId)])
      .then(([s, p]) => {
        if (!live) return
        setState(s)
        setPosts(p)
      })
      .catch(() => { if (live) setError('Could not load this community. Try again.') })
    return () => {
      live = false
    }
  }, [communityId, planId, attempt])

  return (
    <section ref={ref} className="city-inspector" data-expanded={expanded} aria-label={`${name} details`}>
      <header className="sheet-head">
        <div>
          <h2>{name}</h2>
          {/*
            Always present, even before the fetch lands. The card reports its
            own height to the map, so a line that appears late moves the map.
          */}
          <p className="sheet-sub">
            {state ? (
              <>
                <span className="mood">{state.mood.replace(/_/g, ' ')}</span> · {state.post_count}{' '}
                {state.post_count === 1 ? 'post' : 'posts'}
              </>
            ) : (
              <span className="sk sk-chip" aria-hidden="true" />
            )}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="sheet-body">
        {error ? <div role="alert"><p>{error}</p><button className="form-button" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div> : !state ? (
          /*
            The placeholder borrows the real `summary` class rather than
            approximating it, so the box it leaves is the one the text will
            occupy: same margins, same two-line clamp, same height. Announced
            to screen readers, which a silent skeleton would not be.
          */
          <>
            <p className="sr-only" role="status">Loading community…</p>
            <p className="summary sk" aria-hidden="true" />
            <span className="sk sk-button" aria-hidden="true" />
          </>
        ) : (
          <>
            <p className="summary">{state.summary}</p>

            <button className="inspector-toggle form-button" aria-expanded={expanded} aria-controls="community-expanded-details" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Show less' : 'Explore this community'}</button>
            <div className="inspector-details" id="community-expanded-details">
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
            </div>
          </>
        )}
      </div>
    </section>
  )
}
