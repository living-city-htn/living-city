import type { PostInput } from '@living-city/contracts'
import { env } from './env'

type TimeContext = PostInput['time_context']

/**
 * Build `time_context` from a post timestamp and the city's timezone.
 *
 * docs/02 section 4.2: this is Module 2's enrichment, not the model's job. The
 * model uses it only to resolve ambiguity (docs/03 rule 11): a drink at 22:00
 * on a weekend leans nightlife, at 09:00 it leans food.
 */
const parts = (when: Date, timeZone: string) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  })
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(when)) if (p.type !== 'literal') out[p.type] = p.value
  return out
}

const bucketOf = (hour: number): TimeContext['time_bucket'] => {
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'night'
}

const seasonOf = (month: number): TimeContext['season'] => {
  if (month <= 2 || month === 12) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}

/**
 * Holidays are not modelled this weekend: there is no holiday calendar in the
 * repo and `day_type` only ever nudges ambiguous posts. Weekday/weekend is real.
 */
export const buildTimeContext = (
  when: Date | string,
  timeZone = env.cityTimezone(),
): TimeContext => {
  const date = typeof when === 'string' ? new Date(when) : when
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  const p = parts(safe, timeZone)
  const hour = Number(p.hour ?? '0') % 24
  const minute = Number(p.minute ?? '0')
  const weekday = p.weekday ?? 'Mon'

  return {
    local_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    day_type: weekday === 'Sat' || weekday === 'Sun' ? 'weekend' : 'weekday',
    time_bucket: bucketOf(hour),
    season: seasonOf(Number(p.month ?? '1')),
  }
}
