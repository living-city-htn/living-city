import { GoogleGenAI } from '@google/genai'
import { env } from '../env'
import { log } from '../log'
import { ModelError, type ImagePart, type ModelProvider, type ModelRequest, type ModelResponse } from './types'

/**
 * Gemini, the only provider this weekend. docs/02 section 6.1.
 *
 * Three things matter here and nothing else does:
 *  - `responseSchema`, so the API enforces the shape rather than the prompt
 *    asking nicely (docs/03 section 9).
 *  - temperature 0 and a fixed system prompt, so the same input gives the same
 *    output and the replay set means something (docs/03 principle 7).
 *  - images passed inline for Call A, which is the whole reason Gemini is the
 *    primary provider.
 */

let client: GoogleGenAI | null = null
let clientKey = ''

const getClient = (apiKey: string): GoogleGenAI => {
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey })
    clientKey = apiKey
  }
  return client
}

const withTimeout = async <T>(work: Promise<T>, ms: number, attempts: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ModelError(`model call timed out after ${ms}ms`, 'transport', attempts)),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Models sometimes wrap JSON in a fence despite responseMimeType. Strip it
 * rather than burning the one retry on something this cheap to fix.
 */
const stripFence = (text: string): string => {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}

const toParts = (payload: unknown, images: ImagePart[] | undefined, reminder?: string) => {
  const parts: Array<Record<string, unknown>> = []
  // Images first: the scene facts should be in context before the text that
  // interprets them (docs/03 rule 6).
  for (const image of images ?? []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  }
  parts.push({ text: JSON.stringify(payload) })
  if (reminder) parts.push({ text: reminder })
  return parts
}

export const geminiProvider = (): ModelProvider => ({
  name: 'gemini',

  available: () => env.geminiApiKey().length > 0,

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const apiKey = env.geminiApiKey()
    if (!apiKey) {
      throw new ModelError(
        'GEMINI_API_KEY is not set. Copy .env.example to .env.local and fill it in.',
        'config',
        0,
      )
    }

    const maxAttempts = req.maxAttempts ?? env.maxAttempts()
    const timeoutMs = req.timeoutMs ?? env.requestTimeoutMs()
    const started = Date.now()
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // docs/03 section 7: a bad parse is retried exactly once, with a terse
      // reminder appended. Never a loop - a model that cannot produce JSON
      // twice will not produce it on the fifth try either.
      const reminder = attempt > 1 ? req.retryReminder : undefined
      try {
        const response = await withTimeout(
          getClient(apiKey).models.generateContent({
            model: req.model,
            contents: [{ role: 'user', parts: toParts(req.payload, req.images, reminder) }],
            config: {
              systemInstruction: req.system,
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: req.schema,
              maxOutputTokens: req.maxOutputTokens,
            },
          }),
          timeoutMs,
          attempt,
        )

        const raw = stripFence(response.text ?? '')
        if (!raw) {
          // An empty body with no text is how the API reports a safety block.
          throw new ModelError('model returned an empty response', 'refusal', attempt)
        }

        let json: unknown
        try {
          json = JSON.parse(raw)
        } catch {
          throw new ModelError('model output was not valid JSON', 'parse', attempt)
        }

        return {
          json,
          raw,
          attempts: attempt,
          model: req.model,
          provider: 'gemini',
          latencyMs: Date.now() - started,
        }
      } catch (error) {
        lastError = error
        const kind = error instanceof ModelError ? error.kind : 'transport'
        // A refusal is a verdict, not a flake: retrying re-sends the same
        // content and gets the same answer. The caller hides the post instead.
        if (kind === 'refusal' || kind === 'config' || attempt === maxAttempts) break
        log.warn('provider.retry', {
          model: req.model,
          attempt,
          kind,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (lastError instanceof ModelError) throw lastError
    throw new ModelError(
      lastError instanceof Error ? lastError.message : String(lastError),
      'transport',
      maxAttempts,
    )
  },
})
