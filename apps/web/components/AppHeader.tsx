'use client'

export function CityMark() {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="city-mark">
    <rect width="40" height="40" rx="13" fill="currentColor" />
    <path d="M9 29V18l7-5 7 5v11M23 29V10h8v19M7 29h26" stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    <path d="M14 24h4M26 16h2M26 21h2" stroke="#F4C95D" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
}

export default function AppHeader({ title, context, balance }: {
  title: string
  context: string
  balance: number | null
}) {
  return (
    <header className="app-header">
      <div className="mobile-brand"><CityMark /><span>Living City</span></div>
      <div className="app-header-text">
        <h1>{title}</h1>
        <p>{context}</p>
      </div>
      <span className="app-header-balance" aria-label={balance === null ? 'Points balance loading' : `${balance} points`}>
        <span className="points-coin" aria-hidden="true">✦</span>
        <span>{balance === null ? '—' : balance}<span className="points-label"> points</span></span>
      </span>
    </header>
  )
}
