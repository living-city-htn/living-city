/**
 * The GPTZero authenticity gate. T3 step 5, docs/08 section 7.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * The gate is advisory. It may label, weight and sort. It may not block, delay,
 * hide, delete or replan. A low score on a real resident standing in front of a
 * judge is a worse failure than every synthetic post this will ever miss, so
 * every ambiguous case resolves towards trusting the person.
 *
 * Three consequences that are enforced rather than hoped for:
 *   - it runs on caption and transcript only, never on the image;
 *   - it runs in parallel with Call A and is abandoned the moment Call A
 *     finishes, so it cannot add a millisecond to the post path;
 *   - a failure, a timeout and a missing key all produce a null score, and a
 *     null score is treated as "no opinion", never as "suspicious".
 */

/** The switch. Off unless the deployment sets it. */
export const AUTHENTICITY_GATE = process.env.AUTHENTICITY_GATE === '1'

/**
 * Deliberately short. The gate is racing Call A and loses by default; there is
 * no reason to hold a connection open past the point where the answer can
 * still be used.
 */
const TIMEOUT_MS = Number(process.env.AUTHENTICITY_TIMEOUT_MS ?? 4000)

const ENDPOINT = (process.env.GPTZERO_BASE_URL ?? 'https://api.gptzero.me/v2')
  .replace(/\/$/, '') + '/predict/text'

/**
 * Below this, the civic page marks the report "unverified". It is a label on a
 * row, not a filter on a feed: the post stays exactly where it was.
 */
export const UNVERIFIED_BELOW = 0.35

/** Too little text to judge. Under this many characters the gate is skipped. */
const MIN_CHARS = 40

export type Authenticity = {
  /** 0 to 1. How confident the detector is that a human wrote this. */
  human: number
  /** What the badge says. Derived, so the UI never re-derives it differently. */
  label: 'likely human' | 'uncertain' | 'likely synthetic'
  /** Characters actually sent. Zero means the gate was skipped, not failed. */
  chars: number
}

/**
 * Caption plus transcript, never the image.
 *
 * Spoken words are included because a synthetic post with a synthetic script is
 * exactly what the track is about, and excluding them would leave the most
 * interesting case unchecked.
 */
export const gateText = (caption: string, transcript: string | null): string =>
  [caption.trim(), transcript?.trim()].filter(Boolean).join('\n').slice(0, 5000)

export const labelFor = (human: number): Authenticity['label'] => {
  if (human >= 0.7) return 'likely human'
  if (human >= UNVERIFIED_BELOW) return 'uncertain'
  return 'likely synthetic'
}

/**
 * The weight the signal layer's corroboration math multiplies a post by.
 *
 * Exported and unit-tested standalone because `packages/signal` is not on this
 * branch yet (it lives on civic/signal-layer). When that module lands this
 * function moves into it unchanged; until then the tests are what prove the
 * shape is right.
 *
 * The curve is deliberately gentle and deliberately floored:
 *   - a null score weighs exactly 1. No opinion must not become a penalty,
 *     which is what would happen if a failed gate quietly downweighted a post.
 *   - the floor is 0.5, so even a confident synthetic verdict halves a post's
 *     contribution rather than erasing it. Erasing it would make the gate a
 *     filter, and the gate is not allowed to be a filter.
 *   - it never exceeds 1, so the gate can never promote a post above an
 *     ungated one. It only ever declines to amplify.
 */
export const corroborationWeight = (score: Authenticity | null): number => {
  if (!score) return 1
  return Math.round((0.5 + 0.5 * Math.max(0, Math.min(1, score.human))) * 100) / 100
}

/** True when the civic row should carry an "unverified" label. Advisory only. */
export const isUnverified = (score: Authenticity | null): boolean =>
  score !== null && score.human < UNVERIFIED_BELOW

/**
 * Scores text. Never throws, never rejects, and resolves to null for every
 * failure mode there is: no key, no text, a timeout, a bad response, an outage.
 */
export const scoreText = async (text: string): Promise<Authenticity | null> => {
  const key = process.env.GPTZERO_API_KEY
  if (!key || text.length < MIN_CHARS) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ document: text, multilingual: true }),
    })
    if (!response.ok) return null
    const body = await response.json().catch(() => null)
    const human = readHumanProbability(body)
    if (human === null) return null
    return { human, label: labelFor(human), chars: text.length }
  } catch {
    // Includes the abort. A gate that timed out has no opinion.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pulls the human probability out of the response.
 *
 * Written defensively on purpose: this is the one place a change at the vendor
 * could silently turn every post "synthetic", and the safe failure is null.
 */
export const readHumanProbability = (body: unknown): number | null => {
  const document = (body as {
    documents?: Array<{
      class_probabilities?: { human?: number }
      completely_generated_prob?: number
    }>
  } | null)?.documents?.[0]
  if (!document) return null

  const human = document.class_probabilities?.human
  if (typeof human === 'number' && Number.isFinite(human)) {
    return Math.max(0, Math.min(1, human))
  }
  const generated = document.completely_generated_prob
  if (typeof generated === 'number' && Number.isFinite(generated)) {
    return Math.max(0, Math.min(1, 1 - generated))
  }
  return null
}

/**
 * Scores, keyed by post. Module memory, the same posture as `lib/pipeline.ts`:
 * the score is advisory and regenerating it costs one API call, so losing it on
 * a cold start costs nothing that matters.
 *
 * NOT stored on the Post record, which would mean editing
 * `packages/contracts/src/db.ts`. That contract needs the Pipeline owner plus
 * one other person, so the proposed field is a REQUESTS entry in docs/08.
 */
const scores = new Map<string, Authenticity>()

export const setAuthenticity = (postId: string, score: Authenticity | null): void => {
  if (score) scores.set(postId, score)
}

export const authenticityOf = (postId: string): Authenticity | null =>
  scores.get(postId) ?? null

export const resetAuthenticity = (): void => scores.clear()
