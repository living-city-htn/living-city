/**
 * The operator's controls. docs/04 section 7 and docs/roles/product.md Stage 2.
 *
 * This is the surface the demo is driven from, so every call here says plainly
 * what happened. Nothing retries on its own: during moment 8 a silent retry of
 * a plan trigger would burn model budget, and a silent retry of a reset would
 * wipe a judge's post twice.
 */
export type CityVersion = { plans: Record<string, string>; updated_at: string }
export type TickResult = { replanned: string[]; checked: number | null; version: CityVersion }

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const isVersion = (v: unknown): v is CityVersion =>
  record(v) && record(v.plans) && typeof v.updated_at === 'string' &&
  Object.values(v.plans).every((p) => typeof p === 'string')

async function call(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${url} returned ${response.status}`)
    return body
  } finally {
    clearTimeout(timeout)
  }
}

export async function getVersion(): Promise<CityVersion> {
  const body = await call('/api/city/version')
  if (!isVersion(body)) throw new Error('Unreadable city version')
  return body
}

/**
 * The only thing that replans blocks during moment 8. The panel calls it every
 * ten seconds while it is open; closing the panel is the intended off switch
 * (docs/04 section 7).
 */
export async function tick(): Promise<TickResult> {
  const body = await call('/api/plan/tick', { method: 'POST' })
  if (!record(body) || !isVersion(body.version)) throw new Error('Unreadable tick result')
  const replanned = Array.isArray(body.replanned)
    ? body.replanned.filter((v): v is string => typeof v === 'string')
    : []
  return {
    replanned,
    checked: typeof body.checked === 'number' ? body.checked : null,
    version: body.version,
  }
}

export async function planAll(): Promise<string[]> {
  const body = await call('/api/plan-all', { method: 'POST' })
  if (!record(body) || !Array.isArray(body.replanned)) throw new Error('Unreadable plan-all result')
  return body.replanned.filter((v): v is string => typeof v === 'string')
}

export async function planOne(communityId: string): Promise<void> {
  await call(`/api/communities/${encodeURIComponent(communityId)}/plan`, { method: 'POST' })
}

/**
 * The insurance policy for moment 4: writes the hand-written, validator-passing
 * festival plan into the demo block when a real plan comes back flat.
 */
export async function presetFestival(communityId: string): Promise<void> {
  await call(`/api/communities/${encodeURIComponent(communityId)}/plan/preset`, { method: 'POST' })
}

export async function hidePost(postId: string): Promise<void> {
  await call(`/api/posts/${encodeURIComponent(postId)}/hide`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'operator' }),
  })
}

/** Destructive: seed posts, plans, balances, placements and incidents go back to the start. */
export async function resetDemo(): Promise<CityVersion> {
  const body = await call('/api/operator/reset', { method: 'POST' })
  if (!record(body) || !isVersion(body.version)) throw new Error('Unreadable reset result')
  return body.version
}

/**
 * The QR page's invite state. Volume throttling for moment 8, not a safety
 * fuse: the fuse for bad content is hide-post. A cold process starts unpaused,
 * so the panel shows the live value rather than assuming its own.
 */
export async function getQrPaused(): Promise<boolean> {
  const body = await call('/api/operator/qr')
  if (!record(body) || typeof body.paused !== 'boolean') throw new Error('Unreadable QR state')
  return body.paused
}

export async function setQrPaused(paused: boolean): Promise<boolean> {
  const body = await call('/api/operator/qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paused }),
  })
  if (!record(body) || typeof body.paused !== 'boolean') throw new Error('Unreadable QR state')
  return body.paused
}
