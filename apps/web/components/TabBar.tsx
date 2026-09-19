'use client'

import { CityMark } from './AppHeader'

export const TABS = ['feed', 'city', 'post', 'shop', 'mine'] as const
export type Tab = (typeof TABS)[number]

const LABEL: Record<Tab, string> = {
  feed: 'Feed',
  city: 'City',
  post: 'Post',
  shop: 'Shop',
  mine: 'My City',
}

const ICON: Record<Tab, React.ReactNode> = {
  feed: <path d="M4 7h16M4 12h16M4 17h10" />,
  city: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  post: (
    <>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  shop: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
    </>
  ),
  mine: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
    </>
  ),
}

export default function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="rail-brand"><CityMark /><span>Living<br />City<span className="rail-brand-caption">Made by all of us</span></span></div>
      {TABS.map((tab) => (
        <button
          key={tab}
          className="tab"
          data-active={active === tab}
          data-accent={tab === 'post'}
          onClick={() => onChange(tab)}
          aria-current={active === tab ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICON[tab]}
          </svg>
          <span>{LABEL[tab]}</span>
        </button>
      ))}
      <div className="rail-footer"><span className="rail-footer-icon" aria-hidden="true">✦</span><strong>Your moments.<br />Our city.</strong><span>Share a little of your day.<br />Watch the neighbourhood grow.</span></div>
    </nav>
  )
}
