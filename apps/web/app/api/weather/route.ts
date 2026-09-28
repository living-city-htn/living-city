import { json } from '@/lib/stub'
import { currentWeather } from '@/lib/weather'

// GET /api/weather -> { weather: Weather | null }
// Live weather for the whole city (docs/01 section 8.10). Null when the service
// is unreachable or WEATHER=off; the city then shows no weather at all.
export async function GET() {
  return json({ weather: await currentWeather() })
}
