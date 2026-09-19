'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getFeed, type PostRow } from '@/lib/api'
import type { CityPayload } from './city'
import PostList from './PostList'
import './journey.css'

export default function FeedPage({ communities, onCommunity, onLiked, active = true, refreshKey = 0 }: {
  active?: boolean
  communities: CityPayload['communities']
  onCommunity: (id: string) => void
  onLiked: (balance: number) => void
  refreshKey?: number
}) {
  const [posts, setPosts] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const version = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++version.current
    setLoading(true)
    setError(false)
    try {
      const result = await getFeed()
      if (request === version.current) setPosts(result)
    } catch {
      if (request === version.current) setError(true)
    } finally {
      if (request === version.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (active) void refresh()
    return () => { version.current++ }
  }, [active, refresh, refreshKey])
  const names = Object.fromEntries(communities.map(c => [c.community_id, c.name]))
  return <section className="page-screen feed-page" aria-label="Feed" style={!active ? { display: 'none' } : undefined}>
    <header className="page-heading"><div><p className="eyebrow">Around the neighbourhood</p><h2>Little moments. A living city.</h2><p>See what your neighbours are sharing, then explore their blocks.</p></div>
      <button className="form-button" disabled={loading} onClick={() => void refresh()}>Refresh feed</button>
    </header>
    <div className="feed-layout"><div className="feed-stream" aria-busy={loading}>
      {loading && <div className="journey-state" role="status">Gathering moments from the city…</div>}
      {error && <div className="journey-state"><p role="alert">We couldn’t load the latest posts. Check your connection and try again.</p><button className="form-button" onClick={() => void refresh()}>Try again</button></div>}
      {(posts.length > 0 || (!loading && !error)) && <PostList posts={posts} onLiked={onLiked} communities={names} onCommunity={onCommunity} empty="Your city’s story starts here. Share a moment from the Post tab." />}
    </div>
    <aside className="community-directory" aria-label="Explore communities"><h2>Explore your city</h2><p>Every block has a story.</p><ul>{communities.map(c => <li key={c.community_id}><button onClick={() => onCommunity(c.community_id)}><span>{c.name}</span><span aria-hidden="true">↗</span></button></li>)}</ul></aside></div>
  </section>
}
