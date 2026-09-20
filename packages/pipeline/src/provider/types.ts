/**
 * The provider-neutral seam. docs/02 section 6.1.
 *
 * "The pipeline package talks to models through one internal function: given a
 * system prompt, a user payload, and a JSON schema, return parsed and validated
 * JSON." Nothing above this file mentions a vendor, so a second provider
 * (DeepSeek, text-only Call A with the `image_missing` flag) is one new file -
 * but not before docs/04 Stage 4 item 7.
 */

/** An OpenAPI-subset JSON schema, the shape Gemini's responseSchema accepts. */
export type JsonSchema = Record<string, unknown>

/** An image sent to the model inline. Call A only; Call B never sees images. */
export type ImagePart = {
  mimeType: string
  /** base64, no data: prefix */
  data: string
}

/**
 * A recording sent to the model inline. The voice call only; Call A and Call B
 * never receive audio. Added for T3 (OMNI), and the reason `images` is not
 * simply reused is that a provider encodes the two differently.
 */
export type AudioPart = {
  mimeType: string
  /** base64, no data: prefix */
  data: string
}

export type ModelRequest = {
  /**
   * The fixed prefix: role framing, rules, taxonomy. Byte-identical between
   * calls so prompt caching hits (docs/03 section 9). Never put per-post data
   * in here.
   */
  system: string
  /** The per-call data. Serialised last, after the whole prefix. */
  payload: unknown
  schema: JsonSchema
  images?: ImagePart[]
  /** Voice call only. A provider that cannot hear must reject the request. */
  audio?: AudioPart | null
  model: string
  maxOutputTokens: number
  /** Appended on the retry attempt only. docs/03 section 7. */
  retryReminder?: string
  timeoutMs?: number
  maxAttempts?: number
}

export type ModelResponse = {
  /** Parsed JSON. Shape is not yet trusted - the validator decides that. */
  json: unknown
  raw: string
  attempts: number
  model: string
  provider: string
  latencyMs: number
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'transport' | 'parse' | 'refusal' | 'config',
    readonly attempts: number,
  ) {
    super(message)
    this.name = 'ModelError'
  }
}

export interface ModelProvider {
  readonly name: string
  /** True when the provider is configured well enough to be called at all. */
  available(): boolean
  complete(req: ModelRequest): Promise<ModelResponse>
}
