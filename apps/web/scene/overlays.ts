/**
 * The overlays that sit on top of the public plan without being part of it:
 * live weather and incident markers (docs/01 sections 8.6 and 8.10), plus the
 * reduced-detail budget (section 8.1). Pure, so the arithmetic is tested
 * without a canvas.
 */

export type SceneIncident = {
  id: string
  community_id: string
  type: string
  status: 'reported' | 'verified'
}

export type SceneWeather = {
  effect: 'rain' | 'snow' | 'fog' | null
  intensity: number
  is_day: boolean
  sky: [string, string]
  condition: string
}

/** Pins per block before they collapse into one pin with a count. */
export const MAX_PINS_PER_BLOCK = 3

/**
 * Where a block's pins stand, in block-local units: a short row across the
 * block's middle, verified first so the more serious colour is in front. More
 * than MAX_PINS_PER_BLOCK collapse into the row with an overflow count.
 */
export function pinLayout(
  incidents: SceneIncident[], spread: number,
): { pins: Array<SceneIncident & { x: number; z: number }>; overflow: number } {
  const ordered = [...incidents].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'verified' ? -1 : 1) || a.id.localeCompare(b.id))
  const shown = ordered.slice(0, MAX_PINS_PER_BLOCK)
  const step = Math.min(0.32, spread * 0.3)
  const start = -((shown.length - 1) * step) / 2
  return {
    pins: shown.map((incident, i) => ({ ...incident, x: start + i * step, z: spread * 0.15 })),
    overflow: Math.max(0, ordered.length - shown.length),
  }
}

export function groupByCommunity<T extends { community_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const list = out.get(row.community_id)
    if (list) list.push(row)
    else out.set(row.community_id, [row])
  }
  return out
}

/** How many weather particles to draw across the whole city. */
export function weatherParticleCount(weather: SceneWeather | null, reduced: boolean): number {
  if (!weather?.effect) return 0
  const base = weather.effect === 'rain' ? 420 : weather.effect === 'snow' ? 300 : 26
  const scaled = Math.round(base * Math.max(0.25, Math.min(1, weather.intensity || 0.5)))
  return reduced ? Math.round(scaled * 0.35) : scaled
}

/**
 * Light for the weather. The interface stays white (DESIGN.md), so the sky is
 * a tint on the light and a faint wash on the page colour rather than a blue
 * backdrop: a wet day reads dimmer and cooler, night reads darker.
 */
export function sceneLighting(weather: SceneWeather | null): {
  ambient: number; sun: number; tint: string; wash: number
} {
  if (!weather) return { ambient: 0.9, sun: 1.35, tint: '#ffffff', wash: 0 }
  const dim = ({ clear: 0, cloudy: 0.12, fog: 0.15, drizzle: 0.18, rain: 0.25, snow: 0.08, storm: 0.38 } as Record<string, number>)[weather.condition] ?? 0.1
  const night = weather.is_day ? 0 : 0.3
  return {
    ambient: Math.round((0.9 - dim * 0.6 - night * 0.5) * 100) / 100,
    sun: Math.round((1.35 - dim * 1.2 - night * 1.4) * 100) / 100,
    tint: weather.sky[1],
    wash: Math.min(0.35, 0.1 + dim * 0.5 + night * 0.4),
  }
}

/** Blend two #rrggbb colours; `t` of `b` into `a`. */
export function mix(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
    const n = m ? parseInt(m[1]!, 16) : 0xffffff
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const k = Math.max(0, Math.min(1, t))
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0')
  return `#${c(ar!, br!)}${c(ag!, bg!)}${c(ab!, bb!)}`
}

/** Weather-type plan effects, which live weather replaces. */
const WEATHER_TAGS = new Set(['rain', 'snow', 'fog'])

/**
 * A block's own effects once live weather is known. With live weather the
 * block draws none of its weather-type effects: the city-wide layer draws the
 * real one instead, so no block rains under a clear sky.
 */
export const blockEffects = (effects: string[] | undefined, weather: SceneWeather | null | undefined): string[] =>
  (effects ?? []).filter((e) => !(weather && WEATHER_TAGS.has(e)))

/** Crowd and particle counts under the reduced-detail budget. */
export const budget = (count: number, reduced: boolean): number =>
  reduced ? Math.max(0, Math.round(count * 0.5)) : count
