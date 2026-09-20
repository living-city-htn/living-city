import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { omniProvider } from '../src/provider/omni'

/**
 * Qwen-Omni requires a Base64 data URL for local audio and always answers as
 * SSE. This keeps the adapter aligned with that wire contract without sending
 * audio or a key during the test suite.
 */

const realFetch = globalThis.fetch
const requests: Array<{ body: Record<string, unknown> }> = []

const stream = (parts: string[]) => parts
  .map((part) => `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}`)
  .concat('data: [DONE]')
  .join('\n\n')

const request = {
  system: 'Return JSON only.',
  payload: { caption: 'The plaza is busy.' },
  schema: {},
  audio: { mimeType: 'audio/webm;codecs=opus', data: 'aGVsbG8=' },
  model: 'qwen3.5-omni-flash',
  maxOutputTokens: 800,
  maxAttempts: 1,
}

beforeEach(() => {
  requests.length = 0
  process.env.OMNI_API_KEY = 'test-key'
  process.env.OMNI_BASE_URL = 'https://example.test/v1'
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    requests.push({ body: JSON.parse(init.body) })
    return new Response(stream([
      '{"transcript":"The plaza is busy",',
      '"audio_cues":["crowd chatter"],"speech_mood":"cheerful","confidence":92}',
    ]), { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.OMNI_API_KEY
  delete process.env.OMNI_BASE_URL
})

describe('omniProvider', () => {
  it('sends local audio as a data URL and assembles streamed JSON', async () => {
    const response = await omniProvider().complete(request)

    const body = requests[0]!.body as {
      stream?: boolean
      messages: Array<{ content: Array<{ input_audio?: { data?: string; format?: string } }> }>
    }
    const audio = body.messages[1]!.content[0]!.input_audio

    expect(body.stream).toBe(true)
    expect(audio).toEqual({ data: 'data:;base64,aGVsbG8=', format: 'webm' })
    expect(response.json).toEqual({
      transcript: 'The plaza is busy',
      audio_cues: ['crowd chatter'],
      speech_mood: 'cheerful',
      confidence: 92,
    })
  })
})
