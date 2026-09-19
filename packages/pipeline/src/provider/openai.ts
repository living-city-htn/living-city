import { env } from '../env'
import { log } from '../log'
import { ModelError, type ImagePart, type JsonSchema, type ModelProvider, type ModelRequest, type ModelResponse } from './types'

/**
 * OpenAI, the single critical-path provider for Call A and Call B.
 * `integration/EVENT-FACTS.md` decision 3; the reasoning is in
 * `integration/00-REVIEW.md` tension 2. Gemini stays in `gemini.ts` as the
 * documented alternate and is still one env var away.
 *
 * The same three things matter here as in the Gemini adapter and nothing else
 * does:
 *  - Structured Outputs (`response_format: json_schema`, `strict: true`), so
 *    the API enforces the shape rather than the prompt asking nicely
 *    (docs/03 section 9).
 *  - temperature 0 and a fixed system prompt, so the same input gives the same
 *    output and the replay set means something (docs/03 principle 7).
 *  - images passed inline for Call A, as data URLs.
 *
 * Written against `fetch` rather than the `openai` SDK on purpose: the surface
 * used here is one POST, and a hackathon does not need a dependency install
 * standing between the team and a working key.
 */

/** Raw `fetch` keeps the install surface at zero; see the note above. */
const CHAT_COMPLETIONS = '/chat/completions'

/**
 * Structured Outputs speaks JSON Schema proper, while `call-a/schema.ts` and
 * `call-b/schema.ts` are written in the OpenAPI subset Gemini's
 * `responseSchema` accepts. Translating here rather than rewriting those files
 * keeps one schema source generated from the contracts enums, so the Zod
 * contract and the API schema still cannot drift, and keeps the Gemini path
 * working.
 *
 * Four differences, all mechanical:
 *  - `nullable: true` becomes a type union with `"null"`.
 *  - `propertyOrdering` is not a JSON Schema keyword, and strict mode rejects
 *    keywords it does not know. Dropped; field order comes from `required`.
 *  - every object needs `additionalProperties: false` and must list every
 *    property in `required`. Ours already do the latter.
 *  - the root must be an object, so a root array is wrapped (see `wrapRoot`).
 */
export const toStrictSchema = (schema: JsonSchema): JsonSchema => {
  const { nullable, propertyOrdering, ...rest } = schema as Record<string, unknown>
  const out: Record<string, unknown> = { ...rest }

  if (out.properties && typeof out.properties === 'object') {
    const properties = out.properties as Record<string, JsonSchema>
    out.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toStrictSchema(value)]),
    )
    out.additionalProperties = false
    // Strict mode has no optional fields: everything is required, and a field
    // that may be absent is expressed as nullable instead. Ours already are.
    out.required = Object.keys(properties)
  }

  if (out.items && typeof out.items === 'object') {
    out.items = toStrictSchema(out.items as JsonSchema)
  }

  if (nullable === true && typeof out.type === 'string') {
    out.type = [out.type, 'null']
  }

  return out
}

/** The key the root wrapper uses. Unwrapped again before the caller sees it. */
const ROOT_KEY = 'result'

/**
 * Call A's response schema is a root array (docs/03 rule 21: one object per
 * input post, in input order). Structured Outputs requires a root object, so
 * the array is wrapped on the way out and unwrapped on the way back. Nothing
 * above the provider learns that this happened.
 */
const wrapRoot = (schema: JsonSchema): { schema: JsonSchema; wrapped: boolean } => {
  if (schema.type !== 'array') return { schema: toStrictSchema(schema), wrapped: false }
  return {
    wrapped: true,
    schema: {
      type: 'object',
      properties: { [ROOT_KEY]: toStrictSchema(schema) },
      required: [ROOT_KEY],
      additionalProperties: false,
    },
  }
}

/**
 * The reasoning tiers (gpt-5, o-series) reject `temperature` outright, and
 * spend the output budget on reasoning tokens besides. The defaults in
 * `env.ts` are the deterministic tiers for that reason; this only keeps an
 * override from failing the call outright.
 */
const supportsTemperature = (model: string): boolean => !/^(gpt-5|o\d)/.test(model)

const toContent = (payload: unknown, images: ImagePart[] | undefined, reminder?: string) => {
  const parts: Array<Record<string, unknown>> = []
  // Images first: the scene facts should be in context before the text that
  // interprets them (docs/03 rule 6).
  for (const image of images ?? []) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    })
  }
  parts.push({ type: 'text', text: JSON.stringify(payload) })
  if (reminder) parts.push({ type: 'text', text: reminder })
  return parts
}

type ChatChoice = {
  message?: { content?: string | null; refusal?: string | null }
  finish_reason?: string
}

const errorMessage = (body: unknown, status: number): string => {
  const error = (body as { error?: { message?: string } } | null)?.error
  return error?.message ? `${status}: ${error.message}` : `HTTP ${status}`
}

export const openaiProvider = (): ModelProvider => ({
  name: 'openai',

  available: () => env.openaiApiKey().length > 0,

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const apiKey = env.openaiApiKey()
    if (!apiKey) {
      throw new ModelError(
        'OPENAI_API_KEY is not set. Copy .env.example to .env.local and fill it in.',
        'config',
        0,
      )
    }

    const maxAttempts = req.maxAttempts ?? env.maxAttempts()
    const timeoutMs = req.timeoutMs ?? env.requestTimeoutMs()
    const started = Date.now()
    const { schema, wrapped } = wrapRoot(req.schema)
    let withTemperature = supportsTemperature(req.model)
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // docs/03 section 7: a bad parse is retried exactly once, with a terse
      // reminder appended. Never a loop - a model that cannot produce JSON
      // twice will not produce it on the fifth try either.
      const reminder = attempt > 1 ? req.retryReminder : undefined
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(`${env.openaiBaseUrl()}${CHAT_COMPLETIONS}`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: toContent(req.payload, req.images, reminder) },
            ],
            ...(withTemperature ? { temperature: 0 } : {}),
            // Best-effort determinism on top of temperature 0, so a rerun of
            // the replay set compares like with like.
            seed: 0,
            max_completion_tokens: req.maxOutputTokens,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'living_city_response', strict: true, schema },
            },
          }),
        })

        const body = await response.json().catch(() => null)

        if (!response.ok) {
          const message = errorMessage(body, response.status)
          // An override that rejects temperature is worth one free correction
          // rather than a failed post on stage.
          if (response.status === 400 && /temperature/i.test(message) && withTemperature) {
            withTemperature = false
            throw new ModelError(message, 'transport', attempt)
          }
          // 4xx is a request we built wrong and will build identically again.
          const kind = response.status >= 500 || response.status === 429 ? 'transport' : 'config'
          throw new ModelError(message, kind, attempt)
        }

        const choice: ChatChoice | undefined = (body as { choices?: ChatChoice[] })?.choices?.[0]

        // Structured Outputs reports a refused generation in its own field
        // rather than as an error, and content filtering shows up in
        // finish_reason. Both are verdicts on the content.
        if (choice?.message?.refusal) {
          throw new ModelError(choice.message.refusal, 'refusal', attempt)
        }
        if (choice?.finish_reason === 'content_filter') {
          throw new ModelError('response blocked by content filter', 'refusal', attempt)
        }
        if (choice?.finish_reason === 'length') {
          throw new ModelError('response truncated at max_completion_tokens', 'parse', attempt)
        }

        const raw = (choice?.message?.content ?? '').trim()
        if (!raw) throw new ModelError('model returned an empty response', 'refusal', attempt)

        let json: unknown
        try {
          json = JSON.parse(raw)
        } catch {
          throw new ModelError('model output was not valid JSON', 'parse', attempt)
        }

        return {
          json: wrapped ? (json as Record<string, unknown>)?.[ROOT_KEY] ?? json : json,
          raw,
          attempts: attempt,
          model: req.model,
          provider: 'openai',
          latencyMs: Date.now() - started,
        }
      } catch (error) {
        lastError = error
        const aborted = error instanceof Error && error.name === 'AbortError'
        if (aborted) {
          lastError = new ModelError(`model call timed out after ${timeoutMs}ms`, 'transport', attempt)
        }
        const kind = lastError instanceof ModelError ? lastError.kind : 'transport'
        // A refusal is a verdict, not a flake: retrying re-sends the same
        // content and gets the same answer. The caller hides the post instead.
        if (kind === 'refusal' || kind === 'config' || attempt === maxAttempts) break
        log.warn('provider.retry', {
          model: req.model,
          attempt,
          kind,
          message: lastError instanceof Error ? lastError.message : String(lastError),
        })
      } finally {
        clearTimeout(timer)
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
