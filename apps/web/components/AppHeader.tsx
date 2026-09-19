'use client'

/**
 * The one piece of green in the interface. It names the city, says what the
 * current tab is for in a line, and carries the points balance so it is visible
 * from every screen rather than only inside the shop.
 */
export default function AppHeader({ title, subtitle, balance }: {
  title: string
  subtitle: string
  balance: number | null
}) {
  return (
    <header className="app-header">
      <div className="app-header-text">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {balance !== null && (
        <span className="app-header-balance" aria-label={`${balance} points`}>{balance} pts</span>
      )}
    </header>
  )
}
