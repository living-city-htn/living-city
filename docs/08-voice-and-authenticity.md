# 08. Voice posting and the authenticity gate

**Status:** Built, unverified. Both flags off.
**Last updated:** 2026-09-19
**Decides:** how a voice note enters the existing post flow through one Huawei OMNI call, and how a GPTZero score labels a post without ever blocking one.

Voice is an optional third input on the post form that already exists. Photo and text posts never call OMNI and their latency does not change. The authenticity gate runs on every post and can never block one.

## Assumptions

1. OMNI's cloud API accepts the OpenAI chat shape with an `input_audio` content part. The adapter is written to that shape and has never been run against the real endpoint. If it differs, `packages/pipeline/src/provider/omni.ts` is the only file that changes.
2. `OMNI_BASE_URL` and `OMNI_MODEL` are placeholders. Real values come from the Huawei console at the event.
3. GPTZero's `/v2/predict/text` returns `documents[0].class_probabilities.human`. The reader also accepts `completely_generated_prob` and returns null for anything else.
4. T1's `docs/06-sponsor-tracks.md` does not exist yet. Track clauses here are quoted from `integration/EVENT-FACTS.md` instead.
5. The civic page is the operator page. There is no separate government screen, and T3 forbids adding one.
6. Blob storage had no existing code. The audio path was built; the photo path was left exactly as it was.
7. Nothing in this document has been executed. `node_modules` cannot be installed on this checkout's drive, so no test, typecheck or latency number here has been observed.

## 1. Scope

| Post type | Calls OMNI | Calls the gate | Added latency |
|---|---|---|---|
| Text | No | Yes, in parallel | 0 |
| Photo and caption | No | Yes, in parallel | 0 |
| Voice note attached | Yes | Yes, in parallel | upload plus one OMNI call |

Both flags default off. With `NEXT_PUBLIC_VOICE_POSTS=0` the form renders no record control, and with `VOICE_POSTS=0` the server ignores an attached clip. With `AUTHENTICITY_GATE=0` no score is fetched and no badge is rendered.

## 2. Capture in a PWA

| Item | Decision |
|---|---|
| API | `MediaRecorder`, format chosen by `isTypeSupported` |
| iOS Safari | `audio/mp4` |
| Android Chrome | `audio/webm;codecs=opus` |
| Bitrate | 32 kbps, speech not music |
| Duration cap | 30 seconds, enforced by a timer in the recorder |
| Size cap | 4 MB client, 6 MB base64 server |

Format is resolved by feature detection, not by reading the user agent. iOS reports false for every webm variant and lands on `audio/mp4` without being told to.

Six UI states, all implemented in `PostComposer.tsx`:

| State | What the person sees |
|---|---|
| idle | "Add a voice note" |
| requesting | "Asking to use the microphone", control disabled |
| recording | "Stop", a counting timer, seconds remaining, a pulsing dot |
| recorded | An audio player, "Record again", "Remove voice note" |
| denied | No control. "Microphone access was declined. You can still post your photo and caption." |
| unavailable | No control. "Recording is not available on this device. You can still post your photo and caption." |

`getUserMedia` needs HTTPS and a user gesture. `createRecorder` is called from the tap handler and nowhere else.

**Test this on a real iPhone, installed to the home screen, before the event.** Standalone PWA microphone access is the most likely thing here to break, and desktop Safari does not prove it works.

## 3. Upload, storage and retention

Audio rides in the `POST /api/posts` body the form already sends. T3 forbids a new route in the demo flow, and 30 seconds of Opus is about 120 KB, about 160 KB base64, which is far inside the body limit.

| Item | Decision |
|---|---|
| Store | Vercel Blob, the same store the photo path is destined for |
| Key | `posts/<post_id>/voice.<ext>` |
| Why that key | The demo's fuse is the operator hiding a post. This shape makes removing a post's audio a prefix, not a search. |
| No token set | The clip stays inline and nothing is uploaded. This is what makes the path run on venue wifi. |

**Retention: the audio is deleted as soon as the transcript is stored. The transcript is kept.**

A recording of someone's voice in a public square is more identifying than a photo of the square. It carries who they are, not just where they stood. The delete fires the moment the voice call returns and is not awaited, so it cannot hold up the response. A failed delete logs `voice.retention delete_failed` with the key, because audio outliving its transcript is a privacy problem rather than a demo problem.

This is one constant, `AUDIO_RETENTION` in `apps/web/lib/voice-blob.ts`, not an environment variable. A test asserts its default so it cannot flip silently.

## 4. The OMNI call

Input: the recording, plus the caption, the block name, local time, and whether a photo is present. The photo itself is not sent. OMNI reports what it hears; Call A is what reads the scene.

Output schema, strict, four fields:

```json
{
  "transcript": "string",
  "audio_cues": ["string"],
  "speech_mood": "string",
  "confidence": 0
}
```

| Setting | Value | Why |
|---|---|---|
| Timeout | 8000 ms | Shorter than Call A's. A voice post waits for OMNI and then for Call A, so this is time a judge stands through. |
| Attempts | 2 | One retry, then give up cleanly. |
| Temperature | 0 | Same determinism rule as Call A and Call B. |

The validator distrusts the answer even though the provider enforced a schema, the same posture `call-a/validate.ts` takes. Confidence is clamped to 0 to 100 and rounded, cues are capped at five, and a reply with neither speech nor cues is treated as silence rather than as an analysis.

**Folding into Call A.** The transcript is appended to `PostInput.text`, labelled `[spoken]`, capped at the 1000 characters that field allows. It belongs there because it is the resident's own words, spoken instead of typed. **Call A's output schema is untouched.**

OMNI is a second implementation of the `ModelProvider` interface, not an ad-hoc client beside it. It is not reachable from `getProvider()`: Call A and Call B must never route to it, and the way to guarantee that is for the selector never to return it.

## 5. Degradation ladder

Five rungs. All five end with the post up and analysed from its caption.

| Rung | Log line | What the person reads |
|---|---|---|
| OMNI slow past timeout | `voice.degraded rung=timeout` | "Your voice note took too long to process, so your post went up with its caption." |
| OMNI unreachable | `voice.degraded rung=unreachable` | "Voice processing is offline right now, so your post went up with its caption." |
| Credits exhausted | `voice.degraded rung=credits` | "Voice processing is unavailable right now, so your post went up with its caption." |
| Unsupported format | `voice.degraded rung=unsupported_format` | "This phone recorded in a format we cannot read, so your post went up with its caption." |
| Silence or unintelligible | `voice.degraded rung=unintelligible` | "We could not make out any speech, so your post went up with its caption." |

A sixth state, `disabled`, covers a missing OMNI key. It is silent to the person, because nothing was promised.

There is no branch in the voice path that fails a post. `analyzeVoice` never throws.

## 6. The end-to-end scenario

The walkthrough a judge performs on a phone. It attaches to demo moment 3 and adds no new moment.

1. Judge scans the QR code and taps "Create a post".
2. Taps "Take a photo" and photographs a busy patio. **Vision.**
3. Taps "Add a voice note" and says "there is a band playing on the patio and every table is full". The timer counts down from 30. **Audio.**
4. Types a short caption and taps Post.
5. The clip uploads, OMNI transcribes it and reports cues: `live music`, `crowd chatter`. Audio is deleted.
6. The transcript folds into Call A's payload beside the photo. **Language.**
7. Call A returns a `PostAnalysis` whose `activity_type` reflects the music that only the audio witnessed. The photo showed a full patio; the voice is what said why.
8. The operator's ticker replans the block. Awnings and lights appear.
9. The civic row shows the post with its authenticity badge.

Which modality contributed what: the photo gave occupancy and place type, the audio gave the activity and the cues, the caption gave the location and the framing. Remove any one and the result is poorer, which is the test the Huawei track actually applies.

## 7. The authenticity gate

| Item | Decision |
|---|---|
| Endpoint | `POST /v2/predict/text` |
| Runs on | Caption and transcript. Never the image. |
| Position | In parallel with Call A |
| Timeout | 4000 ms, and abandoned earlier if Call A finishes first |
| Stored | Module memory keyed by post id, not on the Post record |

The gate starts beside Call A and is abandoned the moment Call A settles. `Promise.race([gate, deadline])` cannot settle later than Call A does, so the `Promise.allSettled` around both adds nothing. If the gate loses, the score is null and the post proceeds normally.

The transcript is included deliberately. A synthetic post with a synthetic script is the case the track is about, and excluding spoken words would leave it unchecked.

Three uses, all deterministic, all advisory:

| Use | Behaviour |
|---|---|
| Badge | A label and a percentage on the civic row. |
| Corroboration weight | `0.5 + 0.5 * human`, floored at 0.5, never above 1. A null score weighs exactly 1. |
| Unverified label | Below 0.35 the row is marked "unverified". It filters nothing. |

**A low score never deletes a post, never hides one, and never changes a block.** A false positive on a real resident standing in front of a judge is a worse failure than every synthetic post this will ever miss. Every ambiguous case resolves towards trusting the person: a null score means "no opinion", never "suspicious", and the response reader returns null rather than guessing if the vendor's shape changes, because the alternative is a silent day where every resident reads as synthetic.

`corroborationWeight` is exported and unit-tested standalone because `packages/signal` is not on this branch. When that module lands the function moves into it unchanged.

## 8. Cost and latency

| Path | Added latency | Added cost per post |
|---|---|---|
| Text post | 0 ms | GPTZero only, and only if it wins the race |
| Photo post | 0 ms | GPTZero only, and only if it wins the race |
| Voice post | upload plus one OMNI call, bounded at 8000 ms | One OMNI call plus GPTZero |

The zero is structural. For a post with no clip neither the upload branch nor the voice branch executes, so there is no new `await` on that path. The gate adds nothing on any path because it is abandoned when Call A finishes.

Every post logs `post.latency` with `upload_ms`, `omni_ms`, `added_ms`, `call_a_ms` and `total_ms`. `added_ms` is the number to check against moment 4's budget in `docs/04` section 8.

**No number in this table has been observed.** The logging is in place; the measurement has not been taken, because this checkout cannot install dependencies.

## 9. Fixtures and rehearsal

In `packages/fixtures/data/voice/`:

| File | What it is |
|---|---|
| `voice-analysis.mock.json` | Canned OMNI answers: clean, noisy, silence, incident. |
| `clean.wav` | One second of tone, no background. |
| `noisy.wav` | The same under hiss and room rumble. Stands in for a venue. |
| `synthetic-text.sample.txt` | Marketing copy written to make the gate fire. |

`VOICE_FIXTURES=1` answers the voice call from the mock through the same `ModelProvider` interface the real adapter implements, so what runs offline is what ships. It is read only when `OMNI_API_KEY` is empty, so it cannot shadow a real call.

The WAVs are synthesised, not recorded. Nobody's voice belongs in the repository, and a generated file is identical on every machine.

**Rehearsal line to add:** one voice post performed on stage with venue background noise, with `VOICE_FIXTURES=1` as the fallback if the network is unusable.

## REQUESTS to the Pipeline owner

Two contract changes are needed and neither was made. `packages/contracts` needs the Pipeline owner plus one other person before Gate 2, and all four after it.

**1. `PostAnalysis` has nowhere to put what OMNI heard.** Cues and mood currently live in module memory beside the analysis. Proposed addition to `packages/contracts/src/call-a.ts`:

```ts
voice: z.object({
  audio_cues: z.array(z.string()).max(5),
  speech_mood: z.string(),
  confidence: score,
}).nullable(),
```

**2. The `Post` record has nowhere to put the authenticity score or the audio.** Proposed addition to `packages/contracts/src/db.ts`:

```ts
audio_url: z.string().nullable().optional(),
authenticity_human: z.number().min(0).max(1).nullable().optional(),
```

Until both land, a cold start loses the cues and the score. Neither is on the path from a post to a block, so nothing in the demo breaks when they are lost.

## Open conflict, for the humans

`integration/EVENT-FACTS.md` decision 2 says no model call may sit between a post and a block rebuild except Call A and Call B, and that a third is permitted only in the civic layer, off the demo critical path, behind a flag, and after Gate 2. Decision 4 says OMNI is an additive perception step for voice posts.

The OMNI call as built sits inside `POST /api/posts`, which is between a post and a block rebuild. It is behind a flag and it is additive, but it is not off the critical path for the post that carries a clip.

This is written down rather than resolved, per the output rules in `EVENT-FACTS.md`. The team decides at the gate.
