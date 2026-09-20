import { env } from '../env'
import { log } from '../log'
import { ModelError, type ModelProvider, type ModelRequest, type ModelResponse } from './types'

/**
 * Huawei OMNI, the multimodal perception step for voice posts. T3.
 *
 * This is a second implementation behind the same `ModelProvider` seam that
 * `openai.ts` and `gemini.ts` sit behind, rather than an ad-hoc client beside
 * it. That matters for one reason: `setProvider()` already exists for tests, so
 * the entire voice path can be exercised from fixtures with no key and no
 * network, which is the only way to rehearse this on venue wifi.
 *
 * It is NOT reachable from `getProvider()`. Call A and Call B must never route
 * here, and the way to guarantee that is for the selector never to return it.
 * `voice/index.ts` constructs this one directly.
 *
 * Architectural note, because it is the rule most easily broken: OMNI does not
 * produce geometry, points, placements or a plan. It returns a transcript and
 * what it heard. Everything downstream of that is deterministic code, and Call
 * A remains the only model that reads a post for meaning.
 */

const CHAT_COMPLETIONS = '/chat/completions'

/**
 * OMNI speaks the OpenAI chat shape, with audio as an `input_audio` part. The
 * format field wants the container name alone, not the mime type.
 */
const audioFormat = (mimeType: string): string => {
  const base = mimeType.split(';')[0]?.trim().toLowerCase()
  if (base === 'audio/mp4') return 'm4a'
  if (base === 'audio/ogg') return 'ogg'
  if (base === 'audio/wav') return 'wav'
  return 'webm'
}

const errorMessage = (body: unknown, status: number): string => {
  const error = (body as { error?: { message?: string } } | null)?.error
  return error?.message ? `${status}: ${error.message}` : `HTTP ${status}`
}

/**
 * Qwen's OpenAI-compatible endpoint treats local audio as a Base64 data URL,
 * not a bare Base64 string. It also requires streaming for every OMNI call.
 * Source: https://docs.qwencloud.com/developer-guides/speech/multimodal-speech
 */
const asAudioDataUrl = (base64: string): string => `data:;base64,${base64}`

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>
}

/** Collect the text deltas from Qwen's OpenAI-compatible SSE response. */
const streamText = async (response: Response): Promise<string> => {
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''

  const consume = (line: string) => {
    if (!line.startsWith('data:')) return
    const data = line.slice('data:'.length).trim()
    if (!data || data === '[DONE]') return
    try {
      const chunk = JSON.parse(data) as StreamChunk
      const content = chunk.choices?.[0]?.delta?.content
      if (typeof content === 'string') raw += content
    } catch {
      // Ignore non-data SSE events. A missing final JSON response is reported
      // below as the existing parse failure, which keeps the fallback intact.
    }
  }

  const drain = (final = false) => {
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      consume(buffer.slice(0, newline).replace(/\r$/, ''))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
    if (final && buffer) {
      consume(buffer.replace(/\r$/, ''))
      buffer = ''
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    drain()
  }
  buffer += decoder.decode()
  drain(true)

  return raw
}

/**
 * Audio-capable proxy models can add prose or a Markdown fence despite JSON
 * mode. Accept only a complete JSON object; voice/index.ts still validates the
 * result against the four-field voice contract before it can affect a post.
 */
const parseJsonObject = (raw: string): unknown | null => {
  const trimmed = raw.trim()
  const candidates = new Set<string>([trimmed])

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)) {
    if (match[1]) candidates.add(match[1].trim())
  }

  const firstObject = trimmed.indexOf('{')
  const lastObject = trimmed.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.add(trimmed.slice(firstObject, lastObject + 1))
  }

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
      // Try the next bounded candidate. Unparseable content remains a failure.
    }
  }

  return null
}

/**
 * Distinguishes "we are out of credits" from "the service is down", because
 * T3's ladder gives them different log lines and the operator needs to know
 * which one is happening on stage.
 */
export const classifyStatus = (status: number): 'credits' | 'transport' => (
  status === 402 || status === 429 ? 'credits' : 'transport'
)

export const omniProvider = (): ModelProvider => ({
  name: 'omni',

  available: () => !!env.omniApiKey(),

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const key = env.omniApiKey()
    if (!key) throw new ModelError('OMNI_API_KEY is not set', 'config', 0)
    if (!req.audio) throw new ModelError('the voice call needs audio', 'config', 0)

    const maxAttempts = req.maxAttempts ?? 2
    const timeoutMs = req.timeoutMs ?? env.omniTimeoutMs()
    const started = Date.now()
    let lastError: ModelError | null = null

    // One retry, then give up cleanly. Never more: every extra attempt is
    // latency a judge is standing through, and the post is going to succeed
    // with text-only analysis either way.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(`${env.omniBaseUrl()}${CHAT_COMPLETIONS}`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: req.model,
            temperature: 0,
            max_tokens: req.maxOutputTokens,
            modalities: ['text'],
            stream: true,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: req.system },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    input_audio: {
                      data: asAudioDataUrl(req.audio.data),
                      format: audioFormat(req.audio.mimeType),
                    },
                  },
                  { type: 'text', text: JSON.stringify(req.payload) },
                  ...(attempt > 1 && req.retryReminder
                    ? [{ type: 'text', text: req.retryReminder }]
                    : []),
                ],
              },
            ],
          }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          const kind = classifyStatus(response.status)
          throw new ModelError(errorMessage(body, response.status), kind === 'credits' ? 'refusal' : 'transport', attempt)
        }

        const raw = await streamText(response)
        if (!raw.trim()) throw new ModelError('OMNI returned nothing', 'parse', attempt)

        const json = parseJsonObject(raw)
        if (!json) throw new ModelError('OMNI did not return JSON', 'parse', attempt)

        return {
          json, raw, attempts: attempt, model: req.model,
          provider: 'omni', latencyMs: Date.now() - started,
        }
      } catch (e) {
        // An abort is the timeout rung of the ladder, and is worth its own
        // message: "slow" and "down" are different things to the operator.
        if (e instanceof ModelError) lastError = e
        else if (e instanceof Error && e.name === 'AbortError') {
          lastError = new ModelError(`OMNI did not answer within ${timeoutMs}ms`, 'transport', attempt)
        } else {
          lastError = new ModelError(e instanceof Error ? e.message : 'OMNI call failed', 'transport', attempt)
        }
        log.warn('voice.omni.attempt_failed', { attempt, kind: lastError.kind, error: lastError.message })
        // A config or refusal error will not get better on a second try.
        if (lastError.kind === 'config' || lastError.kind === 'refusal') break
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError ?? new ModelError('OMNI call failed', 'transport', maxAttempts)
  },
})
