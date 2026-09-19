import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { postAnalysisBatchSchema } from '../src/call-a/schema'
import { openaiProvider } from '../src/provider/openai'
import { ModelError } from '../src/provider/types'

/**
 * The adapter against a stubbed `fetch`. No key, no spend, no network - this
 * covers the request we build and how we read the four answers that are not a
 * plain success: a refusal, a content filter, a truncation, and a 4xx.
 */

const realFetch = globalThis.fetch
const requests: Array<{ url: string; body: Record<string, unknown> }> = []

const stub = (reply: unknown, status = 200) => {
  globalThis.fetch = (async (url: unknown, init: { body: string }) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply,
    }
  }) as unknown as typeof fetch
}

/** The body of the first request the stub captured. */
const sent = <T>(): T => requests[0]!.body as T

const ok = (content: unknown, finish = 'stop') => ({
  choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }],
})

const request = {
  system: 'system prefix',
  payload: [{ post_id: 'p1' }],
  schema: postAnalysisBatchSchema,
  model: 'gpt-4.1-mini',
  maxOutputTokens: 1200,
  maxAttempts: 1,
}

beforeEach(() => {
  requests.length = 0
  process.env.OPENAI_API_KEY = 'test-key'
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.OPENAI_API_KEY
})

describe('openaiProvider', () => {
  it('wraps a root array for the API and unwraps it for the caller', async () => {
    stub(ok({ result: [{ post_id: 'p1' }] }))

    const response = await openaiProvider().complete(request)

    // Structured Outputs requires an object at the root, so the schema we send
    // is wrapped...
    const format = sent<{
      response_format: {
        json_schema: { strict: boolean; schema: { type: string; properties: object } }
      }
    }>().response_format
    expect(format.json_schema.strict).toBe(true)
    expect(format.json_schema.schema.type).toBe('object')
    expect(Object.keys(format.json_schema.schema.properties)).toEqual(['result'])

    // ...and nothing above the provider learns that it happened. Call A reads
    // an array here (docs/03 rule 21).
    expect(response.json).toEqual([{ post_id: 'p1' }])
    expect(response.provider).toBe('openai')
  })

  it('sends temperature 0 and the image before the text', async () => {
    stub(ok({ result: [] }))

    await openaiProvider().complete({
      ...request,
      images: [{ mimeType: 'image/jpeg', data: 'abc' }],
    })

    const body = sent<{
      temperature: number
      messages: Array<{ role: string; content: unknown }>
    }>()
    expect(body.temperature).toBe(0)
    expect(body.messages[0]?.role).toBe('system')

    // docs/03 rule 6: the scene facts land in context before the text that
    // interprets them.
    const parts = body.messages[1]?.content as Array<Record<string, { url?: string }>>
    expect(parts[0]?.image_url?.url).toBe('data:image/jpeg;base64,abc')
    expect(parts[1]).toMatchObject({ type: 'text' })
  })

  it('omits temperature for a reasoning-tier override rather than failing', async () => {
    stub(ok({ result: [] }))

    await openaiProvider().complete({ ...request, model: 'gpt-5-mini' })

    expect(sent<{ temperature?: number }>().temperature).toBeUndefined()
  })

  it('treats a refusal as a verdict, not a flake', async () => {
    stub({ choices: [{ finish_reason: 'stop', message: { refusal: 'cannot help with that' } }] })

    // maxAttempts 2 and still one request: a refusal is never retried, because
    // the same content gets the same answer. The caller hides the post.
    await expect(openaiProvider().complete({ ...request, maxAttempts: 2 }))
      .rejects.toMatchObject({ kind: 'refusal' })
    expect(requests).toHaveLength(1)
  })

  it('treats a content filter as a refusal too', async () => {
    stub(ok({ result: [] }, 'content_filter'))

    await expect(openaiProvider().complete(request))
      .rejects.toMatchObject({ kind: 'refusal' })
  })

  it('reports a truncated response as a parse failure, which is retryable', async () => {
    stub(ok({ result: [] }, 'length'))

    await expect(openaiProvider().complete({ ...request, maxAttempts: 2 }))
      .rejects.toMatchObject({ kind: 'parse' })
    expect(requests).toHaveLength(2)
  })

  it('does not retry a request we built wrong', async () => {
    stub({ error: { message: 'Invalid schema for response_format' } }, 400)

    await expect(openaiProvider().complete({ ...request, maxAttempts: 2 }))
      .rejects.toMatchObject({ kind: 'config' })
    expect(requests).toHaveLength(1)
  })

  it('retries a rate limit', async () => {
    stub({ error: { message: 'Rate limit reached' } }, 429)

    await expect(openaiProvider().complete({ ...request, maxAttempts: 2 }))
      .rejects.toMatchObject({ kind: 'transport' })
    expect(requests).toHaveLength(2)
  })

  it('refuses to call without a key', async () => {
    delete process.env.OPENAI_API_KEY
    stub(ok({ result: [] }))

    const error = await openaiProvider().complete(request).catch((e) => e)
    expect(error).toBeInstanceOf(ModelError)
    expect(error.kind).toBe('config')
    expect(requests).toHaveLength(0)
  })
})
