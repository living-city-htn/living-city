/**
 * Voice capture for the post form. Demo moment 3, third input.
 *
 * Voice is additive: `integration/EVENT-FACTS.md` decision 4. Nothing in this
 * file runs unless the person taps record, so a photo or text post never pays
 * for it. The composer imports `VOICE_POSTS` and renders no control when it is
 * off, which keeps the flags-off build byte-for-byte what it is today.
 *
 * The browser half is deliberately thin. Everything that can be decided without
 * a microphone (format choice, caps, countdown, the error a state maps to) is a
 * pure function below and unit-tested; `createRecorder` is the only part that
 * needs a real device, and it is the part that breaks on stage, so it stays
 * small enough to read in one go.
 */

/** The switch. Off unless the deployment sets it, on both halves of the app. */
export const VOICE_POSTS = process.env.NEXT_PUBLIC_VOICE_POSTS === '1'

/** docs/08 section 2: 30 seconds, hard. A judge holds a phone, not a podium. */
export const MAX_RECORDING_MS = 30_000

/**
 * Client-side ceiling, enforced again on the server. 30 seconds of Opus at the
 * bitrate below is ~120 KB; 4 MB is roomy enough for iOS AAC and still small
 * enough that a bad recorder cannot fill the Blob store.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024

/** Speech, not music. Keeps a 30 second clip well under the cap on every codec. */
export const AUDIO_BITS_PER_SECOND = 32_000

/**
 * Tried in order, first supported wins.
 *
 * This resolves per platform without sniffing a user agent: Android Chrome
 * takes the first entry, iOS Safari reports false for every webm variant and
 * lands on audio/mp4. Desktop Safari behaves like iOS, which is why desktop
 * testing does not prove the phone works.
 */
export const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'recorded'
  | 'denied'
  | 'unavailable'

export type Recording = {
  blob: Blob
  mimeType: string
  durationMs: number
  /** Object URL for playback. The caller revokes it. */
  url: string
}

/**
 * The first candidate this browser can actually write.
 *
 * Returns null when MediaRecorder exists but writes nothing we can send, which
 * is a real Safari-in-a-webview case and has to degrade rather than throw.
 */
export const pickMimeType = (
  isTypeSupported?: (type: string) => boolean,
): string | null => {
  if (typeof isTypeSupported !== 'function') return null
  for (const candidate of AUDIO_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate
    } catch {
      // Older implementations throw instead of returning false.
    }
  }
  return null
}

/** Blob key suffix. Kept separate from the mime so key naming stays readable. */
export const extensionFor = (mimeType: string): string => {
  const base = mimeType.split(';')[0]?.trim().toLowerCase()
  if (base === 'audio/mp4') return 'm4a'
  if (base === 'audio/ogg') return 'ogg'
  return 'webm'
}

/** Whole seconds left, floored at zero, for the countdown the recorder shows. */
export const secondsRemaining = (elapsedMs: number): number =>
  Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsedMs) / 1000))

/** m:ss for the timer. A 30 second cap never needs hours. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Is this recording worth sending to OMNI at all?
 *
 * A clip under a second is a mis-tap, and a clip over the byte cap is a bug in
 * the recorder rather than something a judge did. Both degrade to text-only
 * instead of failing the post: degradation ladder rung 5, docs/08 section 5.
 */
export const checkRecording = (
  recording: Pick<Recording, 'blob' | 'durationMs'>,
): { ok: true } | { ok: false; reason: 'too_short' | 'too_large' | 'empty' } => {
  if (recording.blob.size === 0) return { ok: false, reason: 'empty' }
  if (recording.blob.size > MAX_AUDIO_BYTES) return { ok: false, reason: 'too_large' }
  if (recording.durationMs < 1000) return { ok: false, reason: 'too_short' }
  return { ok: true }
}

/** What the person reads. One line, no jargon, never blames them. */
export const recorderMessage = (state: RecorderState): string => {
  switch (state) {
    case 'requesting': return 'Allow microphone access to record.'
    case 'recording': return 'Recording. Say what is happening around you.'
    case 'recorded': return 'Listen back, or record again.'
    case 'denied': return 'Microphone access was declined. You can still post your photo and caption.'
    case 'unavailable': return 'Recording is not available on this device. You can still post your photo and caption.'
    default: return ''
  }
}

export type RecorderHandle = {
  stop: () => void
  cancel: () => void
}

/**
 * Start recording. Resolves with the handle once the stream is live, so the
 * caller can move from `requesting` to `recording` only when it truly is.
 *
 * getUserMedia needs HTTPS and a user gesture, and in a home-screen PWA on iOS
 * it needs both again after every cold start. Call this from the tap handler
 * and nowhere else.
 */
export const createRecorder = async (options: {
  onStop: (recording: Recording) => void
  onError: (state: 'denied' | 'unavailable') => void
  onTick?: (elapsedMs: number) => void
}): Promise<RecorderHandle | null> => {
  if (typeof window === 'undefined'
    || typeof MediaRecorder === 'undefined'
    || !navigator.mediaDevices?.getUserMedia) {
    options.onError('unavailable')
    return null
  }

  const mimeType = pickMimeType(MediaRecorder.isTypeSupported)
  if (!mimeType) {
    options.onError('unavailable')
    return null
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    // NotAllowedError is a decline; everything else is a device that cannot.
    const denied = e instanceof DOMException
      && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    options.onError(denied ? 'denied' : 'unavailable')
    return null
  }

  const release = () => { for (const track of stream.getTracks()) track.stop() }

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    })
  } catch {
    release()
    options.onError('unavailable')
    return null
  }

  const chunks: Blob[] = []
  const startedAt = Date.now()
  let cancelled = false

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const tick = options.onTick
    ? window.setInterval(() => options.onTick?.(Date.now() - startedAt), 200)
    : 0

  // The hard cap. A judge who forgets to stop still gets a postable clip.
  const capAt = window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop()
  }, MAX_RECORDING_MS)

  recorder.onstop = () => {
    window.clearTimeout(capAt)
    if (tick) window.clearInterval(tick)
    release()
    if (cancelled) return
    const blob = new Blob(chunks, { type: mimeType })
    options.onStop({
      blob,
      mimeType,
      durationMs: Math.min(Date.now() - startedAt, MAX_RECORDING_MS),
      url: URL.createObjectURL(blob),
    })
  }

  // A 250ms timeslice means a stop always has data, even on iOS where a single
  // final dataavailable can arrive empty.
  recorder.start(250)

  return {
    stop: () => { if (recorder.state !== 'inactive') recorder.stop() },
    cancel: () => {
      cancelled = true
      if (recorder.state !== 'inactive') recorder.stop()
      else { window.clearTimeout(capAt); if (tick) window.clearInterval(tick); release() }
    },
  }
}
