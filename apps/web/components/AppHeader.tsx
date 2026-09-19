'use client'

export default function AppHeader({ title, context, balance, scene = false }: {
  title: string
  context: string
  balance: number | null
  scene?: boolean
}) {
  const content = <>
    <div className="app-header-text"><h1>{title}</h1><p>{context}</p></div>
    <span className="app-header-balance" role="status" aria-label={balance === null ? 'Points balance loading' : `${balance} points`}>
      {balance === null ? '—' : balance}<span className="points-label"> pts</span>
    </span>
  </>
  return scene ? <section className="app-header scene-intro" aria-label="Explore">{content}</section>
    : <header className="app-header">{content}</header>
}
