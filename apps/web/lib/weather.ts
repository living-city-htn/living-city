/**
 * Real current weather over the city. docs/01 section 8.10 and user story 13:
 * "from a weather service, not from posts". Open-Meteo, because it needs no API
 * key (section 13's default).
 *
 * The weather is a global overlay. It never enters a plan, and when it is
 * present it overrides any weather-type effect a plan carries (rain, snow, fog)
 * so the city cannot be sunny in one block and raining in the next.
 *
 * Deterministic: a fixed table from WMO weather codes to what the scene draws.
 */

export type WeatherCondition = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'
export type WeatherEffect = 'rain' | 'snow' | 'fog' | null

export type Weather = {
  condition: WeatherCondition
  effect: WeatherEffect
  /** 0 calm to 1 heavy; scales particle counts. */
  intensity: number
  temperature_c: number | null
  wind_kmh: number | null
  is_day: boolean
  /** Sky gradient, top then horizon. */
  sky: [string, string]
  label: string
  observed_at: string
  source: 'open-meteo' | 'override'
}

/** The demo city. Uptown Waterloo, halfway between the two downtowns. */
export const CITY_POINT = { latitude: 43.4643, longitude: -80.5204 } as const

const SKY: Record<WeatherCondition, { day: [string, string]; night: [string, string] }> = {
  clear: { day: ['#8ec5ff', '#eaf4ff'], night: ['#1c2a48', '#3b4d72'] },
  cloudy: { day: ['#b7c2cf', '#eef1f4'], night: ['#2a303b', '#4a5261'] },
  fog: { day: ['#d6d9dc', '#f2f3f4'], night: ['#3a3e44', '#5a5f66'] },
  drizzle: { day: ['#a9b6c4', '#e3e8ee'], night: ['#27303c', '#465061'] },
  rain: { day: ['#8e9bab', '#d5dbe2'], night: ['#1f2631', '#3c4553'] },
  snow: { day: ['#c9d3de', '#f7f9fb'], night: ['#34404f', '#5b6777'] },
  storm: { day: ['#5f6875', '#a9b0b9'], night: ['#15191f', '#2f3540'] },
}

const LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear', cloudy: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle',
  rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm',
}

/**
 * WMO code table (Open-Meteo `weather_code`) to a condition and intensity.
 * https://open-meteo.com/en/docs, "WMO Weather interpretation codes".
 */
export function fromWmo(code: number): { condition: WeatherCondition; intensity: number } {
  if (code === 0 || code === 1) return { condition: 'clear', intensity: 0 }
  if (code === 2 || code === 3) return { condition: 'cloudy', intensity: 0 }
  if (code === 45 || code === 48) return { condition: 'fog', intensity: 0.7 }
  if (code >= 51 && code <= 57) return { condition: 'drizzle', intensity: code >= 55 ? 0.5 : 0.3 }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    const heavy = code === 65 || code === 67 || code === 82
    const moderate = code === 63 || code === 66 || code === 81
    return { condition: 'rain', intensity: heavy ? 1 : moderate ? 0.7 : 0.45 }
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    const heavy = code === 75 || code === 86
    return { condition: 'snow', intensity: heavy ? 1 : code === 73 ? 0.7 : 0.45 }
  }
  if (code === 95 || code === 96 || code === 99) return { condition: 'storm', intensity: 1 }
  return { condition: 'cloudy', intensity: 0 }
}

const EFFECT: Record<WeatherCondition, WeatherEffect> = {
  clear: null, cloudy: null, fog: 'fog', drizzle: 'rain', rain: 'rain', snow: 'snow', storm: 'rain',
}

export function describe(input: {
  code: number; temperature_c: number | null; wind_kmh: number | null; is_day: boolean
  observed_at: string; source: Weather['source']
}): Weather {
  const { condition, intensity } = fromWmo(input.code)
  return {
    condition,
    effect: EFFECT[condition],
    intensity,
    temperature_c: input.temperature_c,
    wind_kmh: input.wind_kmh,
    is_day: input.is_day,
    sky: SKY[condition][input.is_day ? 'day' : 'night'],
    label: LABELS[condition],
    observed_at: input.observed_at,
    source: input.source,
  }
}

/** For rehearsal: `WEATHER_OVERRIDE=rain` pins the city's weather. */
const OVERRIDE_CODES: Record<string, number> = {
  clear: 0, cloudy: 3, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95,
}

export const weatherEnabled = (): boolean => process.env.WEATHER !== 'off'

const CACHE_MS = 10 * 60_000
let cache: { at: number; value: Weather | null } | null = null

/** Test-only. */
export const resetWeatherCache = (): void => { cache = null }

/**
 * Current weather, cached for ten minutes per server instance so a room full of
 * phones polling costs Open-Meteo one request each ten minutes. Null when the
 * service is unreachable or disabled: the city then simply has no weather.
 */
export async function currentWeather(fetcher: typeof fetch = fetch, now = Date.now()): Promise<Weather | null> {
  if (!weatherEnabled()) return null
  const override = process.env.WEATHER_OVERRIDE?.trim()
  if (override && override in OVERRIDE_CODES) {
    return describe({
      code: OVERRIDE_CODES[override]!, temperature_c: null, wind_kmh: null, is_day: true,
      observed_at: new Date(now).toISOString(), source: 'override',
    })
  }
  if (cache && now - cache.at < CACHE_MS) return cache.value

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(CITY_POINT.latitude))
  url.searchParams.set('longitude', String(CITY_POINT.longitude))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day,wind_speed_10m')
  url.searchParams.set('timezone', 'America/Toronto')

  let value: Weather | null = null
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
    if (response.ok) {
      const body = await response.json() as {
        current?: { time?: string; temperature_2m?: number; weather_code?: number; is_day?: number; wind_speed_10m?: number }
      }
      const c = body.current
      if (c && typeof c.weather_code === 'number') {
        value = describe({
          code: c.weather_code,
          temperature_c: typeof c.temperature_2m === 'number' ? c.temperature_2m : null,
          wind_kmh: typeof c.wind_speed_10m === 'number' ? c.wind_speed_10m : null,
          is_day: c.is_day !== 0,
          observed_at: c.time ? new Date(`${c.time}:00-04:00`).toISOString() : new Date(now).toISOString(),
          source: 'open-meteo',
        })
      }
    }
  } catch {
    value = null
  }
  // A failure is cached too, briefly, so an outage does not become a request
  // per phone per poll.
  cache = { at: value ? now : now - CACHE_MS + 60_000, value }
  return value
}

/** Weather-type effects a plan may carry, which the live weather replaces. */
export const WEATHER_EFFECTS = new Set(['rain', 'snow', 'fog'])

/**
 * A plan's effects with the live weather applied: weather-type effects are
 * dropped and the live one, if any, is added. Without live weather the plan's
 * own effects stand.
 */
export function withWeather(effects: string[], weather: Weather | null): string[] {
  if (!weather) return effects
  const rest = effects.filter((e) => !WEATHER_EFFECTS.has(e))
  return weather.effect ? [...rest, weather.effect] : rest
}
