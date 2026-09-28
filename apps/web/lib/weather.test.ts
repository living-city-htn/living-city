import { afterEach, beforeEach, describe as group, expect, it, vi } from 'vitest'
import { currentWeather, fromWmo, resetWeatherCache, withWeather } from './weather'

const reply = (current: Record<string, unknown>) =>
  vi.fn(async () => new Response(JSON.stringify({ current }), { status: 200 })) as unknown as typeof fetch

beforeEach(() => { resetWeatherCache(); delete process.env.WEATHER_OVERRIDE; delete process.env.WEATHER })
afterEach(() => { delete process.env.WEATHER_OVERRIDE; delete process.env.WEATHER })

group('WMO codes', () => {
  it('maps the families', () => {
    expect(fromWmo(0).condition).toBe('clear')
    expect(fromWmo(3).condition).toBe('cloudy')
    expect(fromWmo(45).condition).toBe('fog')
    expect(fromWmo(61)).toEqual({ condition: 'rain', intensity: 0.45 })
    expect(fromWmo(82).intensity).toBe(1)
    expect(fromWmo(75)).toEqual({ condition: 'snow', intensity: 1 })
    expect(fromWmo(95).condition).toBe('storm')
    expect(fromWmo(12345).condition).toBe('cloudy')
  })
})

group('currentWeather', () => {
  it('reads Open-Meteo and caches for ten minutes', async () => {
    const f = reply({ time: '2026-09-27T14:00', temperature_2m: 12.3, weather_code: 63, is_day: 1, wind_speed_10m: 20 })
    const w = await currentWeather(f, 0)
    expect(w).toMatchObject({ condition: 'rain', effect: 'rain', temperature_c: 12.3, source: 'open-meteo', is_day: true })
    await currentWeather(f, 5 * 60_000)
    expect(f).toHaveBeenCalledTimes(1)
    await currentWeather(f, 11 * 60_000)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('returns null on failure instead of throwing', async () => {
    const f = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await currentWeather(f, 0)).toBeNull()
  })

  it('honours the rehearsal override and the off switch', async () => {
    const f = reply({ weather_code: 0 })
    process.env.WEATHER_OVERRIDE = 'snow'
    expect((await currentWeather(f, 0))?.effect).toBe('snow')
    process.env.WEATHER = 'off'
    expect(await currentWeather(f, 0)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})

group('withWeather', () => {
  it('replaces a plan’s weather effects with the live one', () => {
    const w = { effect: 'snow' } as Parameters<typeof withWeather>[1]
    expect(withWeather(['rain', 'confetti'], w)).toEqual(['confetti', 'snow'])
  })
  it('leaves the plan alone without live weather', () => {
    expect(withWeather(['rain', 'confetti'], null)).toEqual(['rain', 'confetti'])
  })
  it('clears weather effects under a clear sky', () => {
    const w = { effect: null } as Parameters<typeof withWeather>[1]
    expect(withWeather(['fog', 'birds'], w)).toEqual(['birds'])
  })
})
