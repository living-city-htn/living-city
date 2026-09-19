import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ModelProvider, ModelRequest, ModelResponse } from '../provider/types'

/**
 * The offline OMNI. docs/08 section 9.
 *
 * You will be developing on venue wifi, and the demo is the one thing that
 * cannot depend on a network that drops. This provider answers from
 * `packages/fixtures/data/voice/voice-analysis.mock.json` with no key, no
 * socket and no latency worth measuring, through the same `ModelProvider`
 * interface the real adapter implements. That is the point of the interface:
 * the code under test is the code that ships.
 *
 * It is only ever reached when `VOICE_FIXTURES=1` AND no `OMNI_API_KEY` is set,
 * so it can never shadow a real call by accident.
 */

type Mock = Record<string, unknown>

let cache: Mock | null = null

const MOCK_PATH = resolve(
  process.cwd(),
  process.env.VOICE_FIXTURE_PATH
    ?? 'packages/fixtures/data/voice/voice-analysis.mock.json',
)

const loadMock = (): Mock => {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(MOCK_PATH, 'utf8')) as Mock
  } catch {
    // A missing fixture file must not be louder than a missing network. The
    // voice path degrades exactly as it would with an unreachable OMNI.
    cache = {}
  }
  return cache
}

/** Reset between tests, since the file is cached after the first read. */
export const resetVoiceFixtures = (): void => { cache = null }

/**
 * Which canned answer to return.
 *
 * The payload may name a scenario; otherwise `clean` is the default, so the
 * ordinary rehearsal takes the ordinary path without anyone configuring
 * anything.
 */
export const scenarioFor = (payload: unknown): string => {
  const named = (payload as { scenario?: unknown } | null)?.scenario
  return typeof named === 'string' && named.length > 0 ? named : 'clean'
}

export const fixtureVoiceProvider = (): ModelProvider => ({
  name: 'omni-fixture',

  available: () => true,

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const mock = loadMock()
    const scenario = scenarioFor(req.payload)
    const json = mock[scenario] ?? mock.clean ?? null
    return {
      json,
      raw: JSON.stringify(json),
      attempts: 1,
      model: 'omni-fixture',
      provider: 'omni-fixture',
      latencyMs: 0,
    }
  },
})
