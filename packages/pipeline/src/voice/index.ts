import { env } from '../env'
import { log } from '../log'
import { omniProvider } from '../provider/omni'
import { ModelError, type AudioPart, type JsonSchema, type ModelProvider } from '../provider/types'

/**
 * The voice call. T3, docs/08 sections 4 and 5.
 *
 * One recording in, a transcript and what was heard out. This is perception,
 * not judgement: it never decides whether a post is about the block, never
 * scores it, and never touches a plan. Its output is folded into Call A's
 * payload and Call A remains the only model that reads a post for meaning.
 *
 * Every failure here is survivable by design. There is no branch in this file
 * that makes a post fail; the worst case returns `analysis: null` with a reason
 * and the caller proceeds with the caption alone.
 */

/** The strict output contract. Four fields, nothing the model can improvise. */
export const voiceAnalysisSchema: JsonSchema = {
  type: 'object',
  properties: {
    transcript: { type: 'string' },
    audio_cues: { type: 'array', items: { type: 'string' } },
    speech_mood: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['transcript', 'audio_cues', 'speech_mood', 'confidence'],
}

export type VoiceAnalysis = {
  transcript: string
  audio_cues: string[]
  speech_mood: string
  /** 0 to 100. How much of the speech OMNI believes it got right. */
  confidence: number
}

/** The five rungs of the ladder, plus the two states that are not failures. */
export type VoiceDegradation =
  | 'none'
  | 'disabled'
  | 'timeout'
  | 'unreachable'
  | 'credits'
  | 'unsupported_format'
  | 'unintelligible'

export type VoiceResult = {
  analysis: VoiceAnalysis | null
  degraded: VoiceDegradation
  latencyMs: number
  attempts: number
}

/**
 * Byte-identical between calls so prompt caching can hit, same rule as Call A.
 * Never put per-post data in here.
 */
export const VOICE_SYSTEM_PROMPT = [
  'You transcribe a short voice note recorded outdoors in a city block and report what you hear.',
  '',
  'Return JSON only, matching the schema exactly. Four fields:',
  '  transcript    - what the speaker said, verbatim, in the language they spoke.',
  '                  Empty string if there is no intelligible speech.',
  '  audio_cues    - what is audible BESIDES the speaker, as short noun phrases.',
  '                  Examples: "live music", "traffic", "rain", "crowd chatter".',
  '                  Empty array if you hear nothing else. Never guess.',
  '  speech_mood   - one or two words for how the speaker sounds, not what they',
  '                  say. Examples: "cheerful", "hurried", "alarmed", "flat".',
  '  confidence    - 0 to 100, how much of the speech you are confident you got.',
  '',
  'Rules:',
  '  Report only what is in the audio. Do not infer from the photo or caption.',
  '  Do not translate. Do not summarise. Do not add punctuation you did not hear.',
  '  If the recording is silence, noise, or unintelligible, return an empty',
  '  transcript and a low confidence rather than a guess.',
  '  Never identify or name the speaker.',
].join('\n')

export const VOICE_RETRY_REMINDER =
  'Return only the four JSON fields. No prose, no code fence, no extra keys.'

const MAX_TRANSCRIPT = 600
const MAX_CUES = 5

/**
 * Coerce whatever came back into the contract, or reject it.
 *
 * The model is not trusted to have obeyed the schema even when the provider
 * enforced one, which is the same posture `call-a/validate.ts` takes.
 */
export const validateVoiceAnalysis = (value: unknown): VoiceAnalysis | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  const transcript = typeof raw.transcript === 'string' ? raw.transcript.trim().slice(0, MAX_TRANSCRIPT) : ''
  const cues = Array.isArray(raw.audio_cues)
    ? raw.audio_cues
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim().slice(0, 40))
      .slice(0, MAX_CUES)
    : []
  const mood = typeof raw.speech_mood === 'string' ? raw.speech_mood.trim().slice(0, 40) : ''
  const confidenceRaw = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? raw.confidence
    : 0
  const confidence = Math.max(0, Math.min(100, Math.round(confidenceRaw)))

  // Nothing said and nothing heard is not an analysis, it is silence. The
  // caller turns this into the `unintelligible` rung.
  if (!transcript && cues.length === 0) return null

  return { transcript, audio_cues: cues, speech_mood: mood, confidence }
}

/** Maps a provider failure onto the rung of the ladder it belongs to. */
export const degradationFor = (error: ModelError): VoiceDegradation => {
  if (error.kind === 'config') return 'disabled'
  if (error.kind === 'refusal') return 'credits'
  if (error.kind === 'parse') return 'unintelligible'
  return /within \d+ms/.test(error.message) ? 'timeout' : 'unreachable'
}

/** Containers OMNI accepts. Anything else is rung 4, decided before the call. */
const SUPPORTED = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']

export const formatSupported = (mimeType: string): boolean =>
  SUPPORTED.includes(mimeType.split(';')[0]?.trim().toLowerCase() ?? '')

export type VoiceRequest = {
  audio: AudioPart
  /** Context, so cues can be read against the scene. Never used to invent speech. */
  caption: string
  blockName: string | null
  localTime: string
  hasPhoto: boolean
}

/**
 * Run the voice call. Never throws.
 *
 * `provider` is injectable for the same reason `setProvider` exists on the
 * main seam: the fixture provider makes the whole path runnable offline.
 */
export const analyzeVoice = async (
  request: VoiceRequest,
  options: { provider?: ModelProvider } = {},
): Promise<VoiceResult> => {
  const started = Date.now()
  const provider = options.provider ?? omniProvider()

  if (!provider.available()) {
    log('voice.degraded', { rung: 'disabled', reason: 'no OMNI key configured' })
    return { analysis: null, degraded: 'disabled', latencyMs: 0, attempts: 0 }
  }

  if (!formatSupported(request.audio.mimeType)) {
    log('voice.degraded', { rung: 'unsupported_format', mime: request.audio.mimeType })
    return { analysis: null, degraded: 'unsupported_format', latencyMs: 0, attempts: 0 }
  }

  try {
    const response = await provider.complete({
      system: VOICE_SYSTEM_PROMPT,
      payload: {
        caption: request.caption.slice(0, 1000),
        block_name: request.blockName,
        local_time: request.localTime,
        photo_present: request.hasPhoto,
      },
      schema: voiceAnalysisSchema,
      audio: request.audio,
      model: env.omniModel(),
      maxOutputTokens: 800,
      retryReminder: VOICE_RETRY_REMINDER,
      timeoutMs: env.omniTimeoutMs(),
      maxAttempts: env.omniMaxAttempts(),
    })

    const analysis = validateVoiceAnalysis(response.json)
    if (!analysis) {
      log('voice.degraded', { rung: 'unintelligible', reason: 'no speech and no cues' })
      return {
        analysis: null, degraded: 'unintelligible',
        latencyMs: response.latencyMs, attempts: response.attempts,
      }
    }

    log('voice.ok', {
      latency_ms: response.latencyMs, attempts: response.attempts,
      confidence: analysis.confidence, cues: analysis.audio_cues.length,
      transcript_chars: analysis.transcript.length,
    })
    return {
      analysis, degraded: 'none',
      latencyMs: response.latencyMs, attempts: response.attempts,
    }
  } catch (e) {
    const error = e instanceof ModelError ? e : new ModelError(
      e instanceof Error ? e.message : 'voice call failed', 'transport', 1,
    )
    const rung = degradationFor(error)
    log('voice.degraded', { rung, error: error.message, attempts: error.attempts })
    return {
      analysis: null, degraded: rung,
      latencyMs: Date.now() - started, attempts: error.attempts,
    }
  }
}

/**
 * How the voice result reaches Call A.
 *
 * The transcript is the resident's own words, spoken instead of typed, so it
 * belongs in the text Call A already reads. It is labelled so the model can
 * tell speech from caption, and the whole thing is capped at the 1000
 * characters `PostInput.text` allows.
 *
 * Cues and mood are deliberately NOT folded in: `PostAnalysis` has no field for
 * them and T3 forbids changing that contract. They are carried beside the
 * analysis instead and used by the civic display and the corroboration weight.
 * The proper home for them is the REQUESTS entry in docs/08.
 */
export const foldVoiceIntoText = (caption: string, analysis: VoiceAnalysis | null): string => {
  if (!analysis?.transcript) return caption.slice(0, 1000)
  const spoken = `[spoken] ${analysis.transcript}`
  if (!caption.trim()) return spoken.slice(0, 1000)
  return `${caption.trim()}\n${spoken}`.slice(0, 1000)
}
