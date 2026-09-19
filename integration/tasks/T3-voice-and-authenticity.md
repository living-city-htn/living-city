# T3: Voice posting, OMNI perception, and the authenticity gate

**Wave:** 2 (parallel)
**Time:** 75 minutes
**Writes:** `docs/08-voice-and-authenticity.md` (new)
**Owner:** Pipeline owner for the call, Product owner for the capture UI
**Depends on:** T1

## Why this exists
Two tracks, one post flow. Huawei OMNI Live needs vision, audio and language in one end-to-end scenario, which the current flow cannot claim because there is no audio. GPTZero needs AI-detection used significantly, and the pack already has a `flags` concept where an authenticity signal belongs. Both must attach to demo moment 3 without making the existing photo-and-caption path slower or more fragile.

## What the document must contain
1. **Scope line, first paragraph.** Voice is an optional third input on the existing post form. Photo and text posts behave exactly as today and never call OMNI. The authenticity gate runs on every post but can never block one on failure.
2. **Capture in a PWA.** How audio is recorded through the browser on iOS Safari and Android Chrome, the permission flow, the duration cap (propose 20 to 30 seconds), the recorded format per platform, and the UI states: idle, recording with a timer, recorded with playback and a re-record option, denied permission. What the user sees if the microphone is unavailable.
3. **Upload and storage.** Where audio goes (the same Blob storage as photos), key naming, size cap, and whether it is retained after transcription. Voice recordings are more sensitive than photos of a street, so state the retention and access decision explicitly.
4. **The OMNI call.** Input assembly (audio plus the photo when present plus the caption plus the block name and local time), the output contract as a strict schema (transcript, audio cues such as crowd noise or music or rain, a speech mood hint, a confidence), the timeout, and the retry rule. Then how this output is folded into the existing Call A payload **without changing the `PostAnalysis` output contract**. If a field must be added to `PostAnalysis`, record it as a request to the Pipeline owner with the exact proposed shape.
5. **Degradation ladder for voice.** OMNI slow, OMNI down, credits exhausted, unsupported audio format, silence or unintelligible audio. Each with what the post becomes (text-only analysis with the caption), what the user sees, and what is logged. A voice post must never fail outright.
6. **The end-to-end scenario the track requires.** Write it as a numbered walkthrough a judge performs on a phone: photo of a busy patio, spoken sentence about live music, caption, post, block changes. Name which modality contributed which part of the result, because the track is judged on all three being meaningful rather than decorative.
7. **The authenticity gate.** Which GPTZero endpoint runs on what text (caption and transcript, not the photo), where it runs relative to Call A, its timeout, the score's home in the post record, and the three deterministic uses of the score: display as an authenticity badge on the civic page, weight in the signal layer's corroboration math, and a threshold that marks a report as unverified rather than hiding it. Be explicit that a low score never deletes a post and never changes a block, because a false positive on a real resident would be worse than a missed synthetic post.
8. **Cost and latency.** Added milliseconds and dollars per voice post and per ordinary post, checked against moment 4's latency budget in `docs/04` section 8.
9. **Fixtures and rehearsal.** The new fixtures needed (`voice-analysis.mock.json`, two sample audio files, one clean and one noisy, plus one synthetic-text sample for the gate), and the rehearsal line to add: a voice post performed on stage with venue background noise.

## Hard constraints
- The photo and text path keeps its current latency. Voice work happens only when audio is attached.
- No new demo moment. This attaches to moment 3 and to the judge flow in moment 8.
- The authenticity gate is advisory. It may label, weight and sort. It may not hide, delete or replan.
- Breadth caps are untouched: this adds no archetype, asset, slot or effect.

## Prompt to paste

```
Read integration/EVENT-FACTS.md, integration/00-REVIEW.md, docs/06-sponsor-tracks.md,
docs/01-prd.md sections 8.1, 8.3 and 8.4, docs/02-architecture.md sections 4.2 and 6.1,
docs/03-prompt-spec.md sections 2.2, 3.1 and 4.1, and docs/04-hackathon-plan.md sections 2, 7
and 8.

Task: write docs/08-voice-and-authenticity.md in the same voice as the existing docs. It adds
voice input through a Huawei OMNI multimodal call and a GPTZero authenticity gate to the
existing post flow, satisfying the Huawei OMNI Live and GPTZero tracks, without slowing or
destabilising the current photo and text path.

Open by scoping it: voice is an optional third input, photo and text posts never call OMNI, and
the authenticity gate can never block a post.

Then specify: audio capture in a PWA on iOS Safari and Android Chrome with permission flow,
duration cap, per-platform recording format and every UI state including denied permission;
upload, storage, key naming, size cap and an explicit retention and access decision, treating
voice as more sensitive than a street photo; the OMNI call with input assembly, a strict output
schema (transcript, audio cues, speech mood hint, confidence), timeout and retry, and how its
output folds into the existing Call A payload without changing the PostAnalysis output
contract, recording any needed field as a request to the Pipeline owner with a proposed shape;
a degradation ladder for OMNI slow, OMNI down, credits exhausted, unsupported format and
unintelligible audio, where a voice post never fails outright; a numbered end-to-end
walkthrough a judge performs on a phone that shows all three modalities contributing
meaningfully; the GPTZero gate with the endpoint used, the text it runs on, where it sits
relative to Call A, its timeout, where the score lives, and three deterministic uses of the
score (a civic badge, corroboration weighting, and an unverified label), stating explicitly
that a low score never deletes a post or changes a block; added latency and cost per voice post
and per ordinary post checked against the moment 4 latency budget; and the new fixtures plus
one rehearsal line for a voice post with venue background noise.

Constraints: no new demo moment, no change to breadth caps, the authenticity gate stays
advisory, and the photo and text path keeps its current latency. Assumptions section at the top.
```
